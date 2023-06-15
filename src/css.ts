import {CurrentValues, PanzoomOptions} from './types'

/**
 * Lazy creation of a CSS style declaration
 */
// let divStyle: CSSStyleDeclaration
// function createStyle() {
//   if (divStyle) {
//     return divStyle
//   }
//   return (divStyle = document.createElement('div').style)
// }

/**
 * Proper prefixing for cross-browser compatibility
 */
// const prefixes = ['webkit', 'moz', 'ms']
// const prefixCache: { [key: string]: string } = {}
// function getPrefixedName(name: string) {
//   if (prefixCache[name]) {
//     return prefixCache[name]
//   }
//   const divStyle = createStyle()
//   if (name in divStyle) {
//     return (prefixCache[name] = name)
//   }
//   const capName = name[0].toUpperCase() + name.slice(1)
//   let i = prefixes.length
//   while (i--) {
//     const prefixedName = `${prefixes[i]}${capName}`
//     if (prefixedName in divStyle) {
//       return (prefixCache[name] = prefixedName)
//     }
//   }
// }

// CSS Typed OM support
const doCSSTOM = !!window.CSS && !!CCS.number;
const scaleValue: CSSScale | null = null;
const translateValue: CSSTranslate | null = null;
const transformValue: CSSTransformValue | null = null;

if (doCSSTOM) {
  this.scaleValue = new CSSScale(CSS.number(1), CSS.number(1));
  this.translateValue = new CSSTranslate(CSS.px(0), CSS.px(0));
  this.transformValue = new CSSTransformValue([scaleValue, translateValue]);
}

/**
 * Gets a style value expected to be a number
 */
export function getCSSNum(name: string, style: CSSStyleDeclaration) {
  // return parseFloat(style[getPrefixedName(name) as any]) || 0
  return parseFloat(style[name as any]) || 0
}

function getBoxStyle(
  elem: HTMLElement | SVGElement,
  name: string,
  style: CSSStyleDeclaration = window.getComputedStyle(elem)
) {
  // Support: FF 68+
  // Firefox requires specificity for border
  const suffix = name === 'border' ? 'Width' : ''
  return {
    left: getCSSNum(`${name}Left${suffix}`, style),
    right: getCSSNum(`${name}Right${suffix}`, style),
    top: getCSSNum(`${name}Top${suffix}`, style),
    bottom: getCSSNum(`${name}Bottom${suffix}`, style)
  }
}

/**
 * Set a style using the properly prefixed name
 */
export function setStyle(elem: HTMLElement | SVGElement, name: string, value: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // elem.style[getPrefixedName(name) as any] = value
  elem.style[name as any] = value
}

/**
 * Constructs the transition from panzoom options
 * and takes care of prefixing the transition and transform
 */
export function setTransition(elem: HTMLElement | SVGElement, options: PanzoomOptions) {
  // const transform = getPrefixedName('transform')
  // setStyle(elem, 'transition', `${transform} ${options.duration}ms ${options.easing}`)
  setStyle(elem, 'transition', `transform ${options.duration}ms ${options.easing}`)
}

/**
 * Set the transform using the proper prefix
 */
export function setTransform(
  elem: HTMLElement | SVGElement,
  { x, y, scale, isSVG }: CurrentValues,
  _options?: PanzoomOptions
) {
  if (doCSSTOM) {
    setTransformCSSTOM(elem, x, y, scale);
  }
  else {
    setStyle(elem, 'transform', `translate(${scale * x}px, ${scale * y}px) scale(${scale})`)
  }
  if (isSVG) {
    // VERIFY: This seems really inefficient and I'm not sure why it's needed for SVG.
    // The transform above is evaluated on the element in CSS and then copied as a matrix back to the SVG attribute.
    // Is the CSS transform ignored for SVG?
    // Updating the SVG matrix directly would be more efficient.
    const matrixValue = window.getComputedStyle(elem).getPropertyValue('transform')
    elem.setAttribute('transform', matrixValue)
  }
}

function setTransformCSSTOM(
  elem: HTMLElement | SVGElement,
  x: number,
  y: number,
  scale: number
) {
  (scaleValue!.x as CSSUnitValue).value = scale;
  (scaleValue!.y as CSSUnitValue).value = scale;
  (translateValue!.x as CSSUnitValue).value = x;
  (translateValue!.y as CSSUnitValue).value = y;
  elem.attributeStyleMap.set("transform", transform);
}

/**
 * Dimensions used in containment and focal point zooming
 * The parent dimensions do not transform and are taken from getBoundingClientRect().
 * The elem dimensions are untransformed.
 */
export function getDimensions(elem: HTMLElement | SVGGraphicsElement) {
  const parent = elem.parentNode as HTMLElement | SVGElement
  const style = window.getComputedStyle(elem)
  const parentStyle = window.getComputedStyle(parent)
  // const rectElem = elem.getBoundingClientRect()
  const rectElem =
    elem instanceof SVGGraphicsElement
      ? elem.getBBox()
      : { width: elem.offsetWidth, height: elem.offsetHeight }
  const rectParent = parent.getBoundingClientRect()

  return {
    elem: {
      style,
      width: rectElem.width,
      height: rectElem.height,
      // top: rectElem.top,
      // bottom: rectElem.bottom,
      // left: rectElem.left,
      // right: rectElem.right,
      margin: getBoxStyle(elem, 'margin', style),
      border: getBoxStyle(elem, 'border', style)
    },
    parent: {
      style: parentStyle,
      width: rectParent.width,
      height: rectParent.height,
      top: rectParent.top,
      bottom: rectParent.bottom,
      left: rectParent.left,
      right: rectParent.right,
      padding: getBoxStyle(parent, 'padding', parentStyle),
      border: getBoxStyle(parent, 'border', parentStyle)
    }
  }
}

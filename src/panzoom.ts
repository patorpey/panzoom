/**
 * Panzoom for panning and zooming elements using CSS transforms
 * https://github.com/timmywil/panzoom
 *
 * Copyright Timmy Willison and other contributors
 * Released under the MIT license
 * https://github.com/timmywil/panzoom/blob/master/MIT-License.txt
 *
 */

import { getDimensions, setStyle, setTransform, setTransition } from './css'
import { destroyPointer, eventNames, onPointer } from './events'
import isAttached from './isAttached'
import isExcluded from './isExcluded'
import isSVGElement from './isSVGElement'
import { addPointer, getDistance, getMiddle, removePointer } from './pointers'
import shallowClone from './shallowClone'
import {
  PanOptions,
  PanzoomEvent,
  PanzoomEventDetail,
  PanzoomObject,
  PanzoomOptions,
  ZoomOptions
} from './types'

const defaultOptions: PanzoomOptions = {
  animate: false,
  canvas: false,
  cursor: 'move',
  disablePan: false,
  disableZoom: false,
  disableXAxis: false,
  disableYAxis: false,
  duration: 200,
  easing: 'ease-in-out',
  exclude: [],
  excludeClass: 'panzoom-exclude',
  handleStartEvent: (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
  },
  maxScale: 4,
  minScale: 0.125,
  overflow: 'hidden',
  panOnlyWhenZoomed: false,
  relative: false,
  setTransform,
  startX: 0,
  startY: 0,
  startScale: 1,
  step: 0.3,
  touchAction: 'none'
}

function Panzoom(
  elem: HTMLElement | SVGElement,
  options?: Omit<PanzoomOptions, 'force'>
): PanzoomObject {
  if (!elem) {
    throw new Error('Panzoom requires an element as an argument')
  }
  if (elem.nodeType !== 1) {
    throw new Error('Panzoom requires an element with a nodeType of 1')
  }
  if (!isAttached(elem)) {
    throw new Error('Panzoom should be called on elements that have been attached to the DOM')
  }

  options = {
    ...defaultOptions,
    ...options
  }

  const isSVG = isSVGElement(elem)

  const parent = elem.parentNode as HTMLElement | SVGElement

  // Set parent styles
  parent.style.overflow = options.overflow
  parent.style.userSelect = 'none'
  // This is important for mobile to
  // prevent scrolling while panning
  parent.style.touchAction = options.touchAction
  // Set the cursor style on the parent if we're in canvas mode
  ;(options.canvas ? parent : elem).style.cursor = options.cursor

  // Set element styles
  elem.style.userSelect = 'none'
  elem.style.touchAction = options.touchAction
  // The default for HTML is '50% 50%'
  // The default for SVG is '0 0'
  // SVG can't be changed in IE
  setStyle(
    elem,
    'transformOrigin',
    typeof options.origin === 'string' ? options.origin : isSVG ? '0 0' : '50% 50%'
  )

  function resetStyle() {
    parent.style.overflow = ''
    parent.style.userSelect = ''
    parent.style.touchAction = ''
    parent.style.cursor = ''
    elem.style.cursor = ''
    elem.style.userSelect = ''
    elem.style.touchAction = ''
    setStyle(elem, 'transformOrigin', '')
  }

  function setOptions(opts: Omit<PanzoomOptions, 'force'> = {}) {
    for (const key in opts) {
      if (opts.hasOwnProperty(key)) {
        options[key] = opts[key]
      }
    }
    // Handle option side-effects
    if (opts.hasOwnProperty('cursor') || opts.hasOwnProperty('canvas')) {
      parent.style.cursor = elem.style.cursor = ''
      ;(options.canvas ? parent : elem).style.cursor = options.cursor
    }
    if (opts.hasOwnProperty('overflow')) {
      parent.style.overflow = opts.overflow
    }
    if (opts.hasOwnProperty('touchAction')) {
      parent.style.touchAction = opts.touchAction
      elem.style.touchAction = opts.touchAction
    }
    if (
      opts.hasOwnProperty('minScale') ||
      opts.hasOwnProperty('maxScale') ||
      opts.hasOwnProperty('contain')
    ) {
      setMinMax()
    }
  }

  let x = 0
  let y = 0
  let scale = 1
  let isPanning = false
  zoom(options.startScale, { animate: false })
  // Wait for scale to update
  // for accurate dimensions
  // to constrain initial values
  setTimeout(() => {
    setMinMax()
    pan(options.startX, options.startY, { animate: false })
  })

  function trigger(eventName: PanzoomEvent, detail: PanzoomEventDetail, opts: PanzoomOptions) {
    if (opts.silent) {
      return
    }
    const event = new CustomEvent(eventName, { detail })
    elem.dispatchEvent(event)
  }

  function setTransformWithEvent(
    eventName: PanzoomEvent,
    opts: PanzoomOptions,
    originalEvent?: PanzoomEventDetail['originalEvent']
  ) {
    const value = { x, y, scale, isSVG, originalEvent }
    requestAnimationFrame(() => {
      if (typeof opts.animate === 'boolean') {
        if (opts.animate) {
          setTransition(elem, opts)
        } else {
          setStyle(elem, 'transition', 'none')
        }
      }
      opts.setTransform(elem, value, opts)
    })
    trigger(eventName, value, opts)
    trigger('panzoomchange', value, opts)
    return value
  }

  function setMinMax() {
    if (options.contain) {
      const dims = getDimensions(elem)
      const parentWidth = dims.parent.width - dims.parent.border.left - dims.parent.border.right
      const parentHeight = dims.parent.height - dims.parent.border.top - dims.parent.border.bottom
      const elemWidth = dims.elem.width / scale
      const elemHeight = dims.elem.height / scale
      const elemScaledWidth = parentWidth / elemWidth
      const elemScaledHeight = parentHeight / elemHeight
      if (options.contain === 'inside') {
        options.maxScale = Math.min(elemScaledWidth, elemScaledHeight)
      } else if (options.contain === 'outside') {
        options.minScale = Math.max(elemScaledWidth, elemScaledHeight)
      }
    }
  }

  function constrainXY(
    toX: number | string,
    toY: number | string,
    toScale: number,
    panOptions?: PanOptions
  ) {
    const opts = { ...options, ...panOptions }
    const result = { x, y, opts }
    if (!opts.force && (opts.disablePan || (opts.panOnlyWhenZoomed && scale === opts.startScale))) {
      return result
    }
    toX = parseFloat(toX as string)
    toY = parseFloat(toY as string)

    if (!opts.disableXAxis) {
      result.x = (opts.relative ? x : 0) + toX
    }

    if (!opts.disableYAxis) {
      result.y = (opts.relative ? y : 0) + toY
    }

    if (opts.contain === 'inside') {
      const dims = getDimensions(elem)
      result.x = Math.max(
        -dims.elem.margin.left - dims.parent.padding.left,
        Math.min(
          dims.parent.width -
            dims.elem.width / toScale -
            dims.parent.padding.left -
            dims.elem.margin.left -
            dims.parent.border.left -
            dims.parent.border.right,
          result.x
        )
      )
      result.y = Math.max(
        -dims.elem.margin.top - dims.parent.padding.top,
        Math.min(
          dims.parent.height -
            dims.elem.height / toScale -
            dims.parent.padding.top -
            dims.elem.margin.top -
            dims.parent.border.top -
            dims.parent.border.bottom,
          result.y
        )
      )
    } else if (opts.contain === 'outside') {
      const dims = getDimensions(elem)
      const realWidth = dims.elem.width / scale
      const realHeight = dims.elem.height / scale
      const scaledWidth = realWidth * toScale
      const scaledHeight = realHeight * toScale
      const diffHorizontal = (scaledWidth - realWidth) / 2
      const diffVertical = (scaledHeight - realHeight) / 2
      const minX =
        (-(scaledWidth - dims.parent.width) -
          dims.parent.padding.left -
          dims.parent.border.left -
          dims.parent.border.right +
          diffHorizontal) /
        toScale
      const maxX = (diffHorizontal - dims.parent.padding.left) / toScale
      result.x = Math.max(Math.min(result.x, maxX), minX)
      const minY =
        (-(scaledHeight - dims.parent.height) -
          dims.parent.padding.top -
          dims.parent.border.top -
          dims.parent.border.bottom +
          diffVertical) /
        toScale
      const maxY = (diffVertical - dims.parent.padding.top) / toScale
      result.y = Math.max(Math.min(result.y, maxY), minY)
    }
    return result
  }

  function constrainScale(toScale: number, zoomOptions?: ZoomOptions) {
    const opts = { ...options, ...zoomOptions }
    const result = { scale, opts }
    if (!opts.force && opts.disableZoom) {
      return result
    }
    result.scale = Math.min(Math.max(toScale, opts.minScale), opts.maxScale)
    return result
  }

  function pan(
    toX: number | string,
    toY: number | string,
    panOptions?: PanOptions,
    originalEvent?: PanzoomEventDetail['originalEvent']
  ) {
    const result = constrainXY(toX, toY, scale, panOptions)
    const opts = result.opts

    x = result.x
    y = result.y

    return setTransformWithEvent('panzoompan', opts, originalEvent)
  }

  function zoom(
    toScale: number,
    zoomOptions?: ZoomOptions,
    originalEvent?: PanzoomEventDetail['originalEvent']
  ) {
    const result = constrainScale(toScale, zoomOptions)
    const opts = result.opts
    if (!opts.force && opts.disableZoom) {
      return
    }
    toScale = result.scale
    let toX = x
    let toY = y

    if (opts.point) {
      toX = opts.point.x
      toY = opts.point.y
    } else if (opts.focal) {
      // The difference between the point after the scale and the point before the scale
      // plus the current translation after the scale
      // neutralized to no scale (as the transform scale will apply to the translation)
      const focal = opts.focal
      toX = (focal.x / toScale - focal.x / scale + x * toScale) / toScale
      toY = (focal.y / toScale - focal.y / scale + y * toScale) / toScale
    }
    const panResult = constrainXY(toX, toY, toScale, { relative: false, force: true })
    x = panResult.x
    y = panResult.y
    scale = toScale
    return setTransformWithEvent('panzoomzoom', opts, originalEvent)
  }

  function zoomInOut(isIn: boolean, zoomOptions?: ZoomOptions) {
    const opts = { ...options, animate: true, ...zoomOptions }
    return zoom(scale * Math.exp((isIn ? 1 : -1) * opts.step), opts)
  }

  function zoomIn(zoomOptions?: ZoomOptions) {
    return zoomInOut(true, zoomOptions)
  }

  function zoomOut(zoomOptions?: ZoomOptions) {
    return zoomInOut(false, zoomOptions)
  }

  function zoomToPoint(
    toScale: number,
    point: { clientX: number; clientY: number },
    zoomOptions?: ZoomOptions,
    originalEvent?: PanzoomEventDetail['originalEvent']
  ) {
    const dims = getDimensions(elem)

    // Instead of thinking of operating on the panzoom element,
    // think of operating on the area inside the panzoom
    // element's parent
    // Subtract padding and border
    const effectiveArea = {
      width:
        dims.parent.width -
        dims.parent.padding.left -
        dims.parent.padding.right -
        dims.parent.border.left -
        dims.parent.border.right,
      height:
        dims.parent.height -
        dims.parent.padding.top -
        dims.parent.padding.bottom -
        dims.parent.border.top -
        dims.parent.border.bottom
    }

    // Adjust the clientX/clientY to ignore the area
    // outside the effective area
    let clientX =
      point.clientX -
      dims.parent.left -
      dims.parent.padding.left -
      dims.parent.border.left -
      dims.elem.margin.left
    let clientY =
      point.clientY -
      dims.parent.top -
      dims.parent.padding.top -
      dims.parent.border.top -
      dims.elem.margin.top

    // Adjust the clientX/clientY for HTML elements,
    // because they have a transform-origin of 50% 50%
    if (!isSVG) {
      clientX -= dims.elem.width / scale / 2
      clientY -= dims.elem.height / scale / 2
    }

    // Convert the mouse point from it's position over the
    // effective area before the scale to the position
    // over the effective area after the scale.
    const focal = {
      x: (clientX / effectiveArea.width) * (effectiveArea.width * toScale),
      y: (clientY / effectiveArea.height) * (effectiveArea.height * toScale)
    }

    return zoom(toScale, { animate: false, ...zoomOptions, focal }, originalEvent)
  }

  function zoomWithWheel(event: WheelEvent, zoomOptions?: ZoomOptions) {
    // Need to prevent the default here
    // or it conflicts with regular page scroll
    event.preventDefault()

    const opts = { ...options, ...zoomOptions }

    // Normalize to deltaX in case shift modifier is used on Mac
    const delta = event.deltaY === 0 && event.deltaX ? event.deltaX : event.deltaY
    const wheel = delta < 0 ? 1 : -1
    const toScale = constrainScale(scale * Math.exp((wheel * opts.step) / 3), opts).scale

    return zoomToPoint(toScale, event, opts)
  }

  function reset(resetOptions?: PanzoomOptions) {
    const opts = { ...options, animate: true, force: true, ...resetOptions }
    scale = constrainScale(opts.startScale, opts).scale
    const panResult = constrainXY(opts.startX, opts.startY, scale, opts)
    x = panResult.x
    y = panResult.y
    return setTransformWithEvent('panzoomreset', opts)
  }

  let origX: number
  let origY: number
  let startClientX: number
  let startClientY: number
  let startScale: number
  let startDistance: number
  const pointers: PointerEvent[] = []

  function handleDown(event: PointerEvent) {
    // Don't handle this event if the target is excluded
    if (isExcluded(event.target as Element, options)) {
      return
    }
    addPointer(pointers, event)
    isPanning = true
    options.handleStartEvent(event)
    origX = x
    origY = y

    trigger('panzoomstart', { x, y, scale, isSVG, originalEvent: event }, options)

    // This works whether there are multiple
    // pointers or not
    const point = getMiddle(pointers)
    startClientX = point.clientX
    startClientY = point.clientY
    startScale = scale
    startDistance = getDistance(pointers)
  }

  function move(event: PointerEvent) {
    if (
      !isPanning ||
      origX === undefined ||
      origY === undefined ||
      startClientX === undefined ||
      startClientY === undefined
    ) {
      return
    }
    addPointer(pointers, event)
    const current = getMiddle(pointers)
    if (pointers.length > 1) {
      // #512 prevent zoom issue in mobile
      if (startDistance === 0) {
        startDistance = getDistance(pointers)
      }
      // Use the distance between the first 2 pointers
      // to determine the current scale
      const diff = getDistance(pointers) - startDistance
      const toScale = constrainScale((diff * options.step) / 80 + startScale).scale
      zoomToPoint(toScale, current)
    } else {
      // #512 added else condition to prevent mobile zoom focal point error
      pan(
        origX + (current.clientX - startClientX) / scale,
        origY + (current.clientY - startClientY) / scale,
        {
          animate: false
        },
        event
      )
    }
  }

  function handleUp(event: PointerEvent) {
    // Don't call panzoomend when panning with 2 touches
    // until both touches end
    if (pointers.length === 1) {
      trigger('panzoomend', { x, y, scale, isSVG, originalEvent: event }, options)
    }
    // Note: don't remove all pointers
    // Can restart without having to reinitiate all of them
    // Remove the pointer regardless of the isPanning state
    removePointer(pointers, event)
    if (!isPanning) {
      return
    }
    isPanning = false
    origX = origY = startClientX = startClientY = undefined
  }

  let bound = false
  function bind() {
    if (bound) {
      return
    }
    bound = true
    onPointer('down', options.canvas ? parent : elem, handleDown)
    onPointer('move', document, move, { passive: true })
    onPointer('up', document, handleUp, { passive: true })
  }

  function destroy() {
    bound = false
    destroyPointer('down', options.canvas ? parent : elem, handleDown)
    destroyPointer('move', document, move)
    destroyPointer('up', document, handleUp)
  }

  if (!options.noBind) {
    bind()
  }

  return {
    bind,
    destroy,
    eventNames,
    getPan: () => ({ x, y }),
    getScale: () => scale,
    getOptions: () => shallowClone(options),
    pan,
    reset,
    resetStyle,
    setOptions,
    setStyle: (name: string, value: string) => setStyle(elem, name, value),
    zoom,
    zoomIn,
    zoomOut,
    zoomToPoint,
    zoomWithWheel
  }
}

Panzoom.defaultOptions = defaultOptions

export { PanzoomObject, PanzoomOptions }
export default Panzoom

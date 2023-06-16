/**
 * Panzoom for panning and zooming elements using CSS transforms
 * https://github.com/timmywil/panzoom
 *
 * Copyright Timmy Willison and other contributors
 * Released under the MIT license
 * https://github.com/timmywil/panzoom/blob/master/MIT-License.txt
 *
 */
import { PanzoomObject, PanzoomOptions } from './types';
declare function Panzoom(elem: HTMLElement | SVGGraphicsElement, options?: Omit<PanzoomOptions, 'force'>): PanzoomObject;
declare namespace Panzoom {
    var defaultOptions: PanzoomOptions;
}
export * from './types';
export default Panzoom;

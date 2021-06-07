import { Component, Input, ViewEncapsulation, Renderer2, ElementRef, ViewChild, ContentChild } from '@angular/core';
import { clamp, coerceBooleanProperty, coerceNumberProperty, cssUnit, isNumber } from '../common/util';
import { NgxGaugeLabel, NgxGaugeValue, NgxGaugePrepend, NgxGaugeAppend } from './gauge-directives';
const DEFAULTS = {
    MIN: 0,
    MAX: 100,
    TYPE: 'arch',
    THICK: 4,
    FOREGROUND_COLOR: 'rgba(0, 150, 136, 1)',
    BACKGROUND_COLOR: 'rgba(0, 0, 0, 0.1)',
    CAP: 'butt',
    SIZE: 200
};
export class NgxGauge {
    constructor(_elementRef, _renderer) {
        this._elementRef = _elementRef;
        this._renderer = _renderer;
        this._size = DEFAULTS.SIZE;
        this._min = DEFAULTS.MIN;
        this._max = DEFAULTS.MAX;
        this._animate = true;
        this._initialized = false;
        this._animationRequestID = 0;
        this.ariaLabel = '';
        this.ariaLabelledby = null;
        this.type = DEFAULTS.TYPE;
        this.cap = DEFAULTS.CAP;
        this.thick = DEFAULTS.THICK;
        this.foregroundColor = DEFAULTS.FOREGROUND_COLOR;
        this.backgroundColor = DEFAULTS.BACKGROUND_COLOR;
        this.thresholds = Object.create(null);
        // If set to true, thresholds will remain their color even if the gauge is in another threshold
        this.preserveThresholds = false;
        this._value = 0;
        this.duration = 1200;
    }
    get size() { return this._size; }
    set size(value) {
        this._size = coerceNumberProperty(value);
    }
    get min() { return this._min; }
    set min(value) {
        this._min = coerceNumberProperty(value, DEFAULTS.MIN);
    }
    get animate() { return this._animate; }
    set animate(value) {
        this._animate = coerceBooleanProperty(value);
    }
    get max() { return this._max; }
    set max(value) {
        this._max = coerceNumberProperty(value, DEFAULTS.MAX);
    }
    get value() { return this._value; }
    set value(val) {
        this._value = coerceNumberProperty(val);
    }
    ngOnChanges(changes) {
        const isCanvasPropertyChanged = changes['thick'] || changes['type'] || changes['cap'] || changes['size'];
        const isDataChanged = changes['value'] || changes['min'] || changes['max'];
        if (this._initialized) {
            if (isDataChanged) {
                let nv, ov;
                if (changes['value']) {
                    nv = changes['value'].currentValue;
                    ov = changes['value'].previousValue;
                }
                this._update(nv, ov);
            }
            if (isCanvasPropertyChanged) {
                this._destroy();
                this._init();
            }
        }
    }
    _updateSize() {
        this._renderer.setStyle(this._elementRef.nativeElement, 'width', cssUnit(this._getWidth()));
        this._renderer.setStyle(this._elementRef.nativeElement, 'height', cssUnit(this._getCanvasHeight()));
        this._canvas.nativeElement.width = this._getWidth();
        this._canvas.nativeElement.height = this._getCanvasHeight();
        this._renderer.setStyle(this._label.nativeElement, 'transform', 'translateY(' + (this.size / 3 * 2 - this.size / 13 / 4) + 'px)');
        this._renderer.setStyle(this._reading.nativeElement, 'transform', 'translateY(' + (this.size / 2 - this.size * 0.22 / 2) + 'px)');
    }
    ngAfterViewInit() {
        if (this._canvas) {
            this._init();
        }
    }
    ngOnDestroy() {
        this._destroy();
    }
    _getBounds(type) {
        let head, tail;
        if (type == 'semi') {
            head = Math.PI;
            tail = 2 * Math.PI;
        }
        else if (type == 'full') {
            head = 1.5 * Math.PI;
            tail = 3.5 * Math.PI;
        }
        else if (type === 'arch') {
            head = 0.8 * Math.PI;
            tail = 2.2 * Math.PI;
        }
        return { head, tail };
    }
    _drawShell(start, middle, tail, color) {
        if (this.preserveThresholds) {
            this._drawShellWithSegments(start, middle, tail);
            return;
        }
        let center = this._getCenter(), radius = this._getRadius();
        middle = Math.max(middle, start); // never below 0%
        middle = Math.min(middle, tail); // never exceed 100%
        if (this._initialized) {
            this._clear();
            this._context.beginPath();
            this._context.strokeStyle = this.backgroundColor;
            this._context.arc(center.x, center.y, radius, middle, tail, false);
            this._context.stroke();
            this._context.beginPath();
            this._context.strokeStyle = color;
            this._context.arc(center.x, center.y, radius, start, middle, false);
            this._context.stroke();
        }
    }
    _drawShellWithSegments(start, currentValue, tail) {
        if (this.thresholds && this._initialized) {
            let percentages = Object.keys(this.thresholds), arcLength = tail - start, valuePercent = (currentValue - start) / arcLength;
            this._clear();
            for (let i = 0; i < percentages.length; i++) {
                let startPercentage = (Number(percentages[i]) / 100), nextPercentage = (Number(percentages[i + 1]) / 100) || 1, percentageToTravel = (nextPercentage - startPercentage), color = this.thresholds[percentages[i]].color, fallbackColor = this.thresholds[percentages[i]].fallbackColor || this.backgroundColor;
                if (valuePercent >= startPercentage && valuePercent <= nextPercentage) {
                    let percentageOfCurrentArc = (valuePercent - startPercentage) / percentageToTravel;
                    let activeArcEnd = start + (arcLength * percentageToTravel * percentageOfCurrentArc);
                    this._drawArc(start, activeArcEnd, color);
                    let inactiveArcEnd = activeArcEnd + (arcLength * percentageToTravel * (1 - percentageOfCurrentArc));
                    this._drawArc(activeArcEnd, inactiveArcEnd, fallbackColor);
                    start = inactiveArcEnd;
                }
                else {
                    let arcColor = (startPercentage >= valuePercent) ? fallbackColor : color;
                    let end = start + (arcLength * percentageToTravel);
                    this._drawArc(start, end, arcColor);
                    start = end;
                }
            }
        }
    }
    _drawArc(start, end, color) {
        let center = this._getCenter();
        let radius = this._getRadius();
        this._context.beginPath();
        this._context.strokeStyle = color;
        this._context.arc(center.x, center.y, radius, start, end, false);
        this._context.stroke();
    }
    _clear() {
        this._context.clearRect(0, 0, this._getWidth(), this._getHeight());
    }
    _getWidth() {
        return this.size;
    }
    _getHeight() {
        return this.size;
    }
    // canvas height will be shorter for type 'semi' and 'arch'
    _getCanvasHeight() {
        return (this.type == 'arch' || this.type == 'semi')
            ? 0.85 * this._getHeight()
            : this._getHeight();
    }
    _getRadius() {
        var center = this._getCenter();
        return center.x - this.thick;
    }
    _getCenter() {
        var x = this._getWidth() / 2, y = this._getHeight() / 2;
        return { x, y };
    }
    _init() {
        this._context = this._canvas.nativeElement.getContext('2d');
        this._initialized = true;
        this._updateSize();
        this._setupStyles();
        this._create();
    }
    _destroy() {
        if (this._animationRequestID) {
            window.cancelAnimationFrame(this._animationRequestID);
            this._animationRequestID = 0;
        }
        this._clear();
        this._context = null;
        this._initialized = false;
    }
    _setupStyles() {
        this._context.lineCap = this.cap;
        this._context.lineWidth = this.thick;
    }
    _getForegroundColorByRange(value) {
        const match = Object.keys(this.thresholds)
            .filter(function (item) { return isNumber(item) && Number(item) <= value; })
            .sort((a, b) => Number(a) - Number(b))
            .reverse()[0];
        return match !== undefined
            ? this.thresholds[match].color || this.foregroundColor
            : this.foregroundColor;
    }
    _create(nv, ov) {
        let self = this, type = this.type, bounds = this._getBounds(type), duration = this.duration, min = this.min, max = this.max, value = clamp(this.value, this.min, this.max), start = bounds.head, unit = (bounds.tail - bounds.head) / (max - min), displacement = unit * (value - min), tail = bounds.tail, color = this._getForegroundColorByRange(value), startTime;
        if (self._animationRequestID) {
            window.cancelAnimationFrame(self._animationRequestID);
        }
        function animate(timestamp) {
            timestamp = timestamp || new Date().getTime();
            let runtime = timestamp - startTime;
            let progress = Math.min(runtime / duration, 1);
            let previousProgress = ov ? (ov - min) * unit : 0;
            let middle = start + previousProgress + displacement * progress;
            self._drawShell(start, middle, tail, color);
            if (self._animationRequestID && (runtime < duration)) {
                self._animationRequestID = window.requestAnimationFrame((timestamp) => animate(timestamp));
            }
            else {
                window.cancelAnimationFrame(self._animationRequestID);
            }
        }
        if (this._animate) {
            if (nv != undefined && ov != undefined) {
                displacement = unit * nv - unit * ov;
            }
            self._animationRequestID = window.requestAnimationFrame((timestamp) => {
                startTime = timestamp || new Date().getTime();
                animate(startTime);
            });
        }
        else {
            self._drawShell(start, start + displacement, tail, color);
        }
    }
    _update(nv, ov) {
        this._clear();
        this._create(nv, ov);
    }
}
NgxGauge.decorators = [
    { type: Component, args: [{
                selector: 'ngx-gauge',
                template: "<div class=\"reading-block\" #reading [style.fontSize]=\"size * 0.22 + 'px'\">\r\n  <!-- This block can not be indented correctly, because line breaks cause layout spacing, related problem: https://pt.stackoverflow.com/q/276760/2998 -->\r\n  <u class=\"reading-affix\" [ngSwitch]=\"_prependChild != null\"><ng-content select=\"ngx-gauge-prepend\" *ngSwitchCase=\"true\"></ng-content><ng-container *ngSwitchCase=\"false\">{{prepend}}</ng-container></u><ng-container [ngSwitch]=\"_valueDisplayChild != null\"><ng-content *ngSwitchCase=\"true\" select=\"ngx-gauge-value\"></ng-content><ng-container *ngSwitchCase=\"false\">{{value | number}}</ng-container></ng-container><u class=\"reading-affix\" [ngSwitch]=\"_appendChild != null\"><ng-content select=\"ngx-gauge-append\" *ngSwitchCase=\"true\"></ng-content><ng-container *ngSwitchCase=\"false\">{{append}}</ng-container></u>\r\n</div>\r\n<div class=\"reading-label\" #rLabel\r\n     [style.fontSize]=\"size / 13 + 'px'\"\r\n     [ngSwitch]=\"_labelChild != null\">\r\n  <ng-content select=\"ngx-gauge-label\" *ngSwitchCase=\"true\"></ng-content>\r\n  <ng-container *ngSwitchCase=\"false\">{{label}}</ng-container>\r\n</div>\r\n<canvas #canvas></canvas>\r\n",
                host: {
                    'role': 'slider',
                    'aria-readonly': 'true',
                    '[class.ngx-gauge-meter]': 'true',
                    '[attr.aria-valuemin]': 'min',
                    '[attr.aria-valuemax]': 'max',
                    '[attr.aria-valuenow]': 'value',
                    '[attr.aria-label]': 'ariaLabel',
                    '[attr.aria-labelledby]': 'ariaLabelledby'
                },
                encapsulation: ViewEncapsulation.None,
                styles: [".ngx-gauge-meter{display:inline-block;text-align:center;position:relative}.reading-block,.reading-label{position:absolute;width:100%;font-weight:400;white-space:nowrap;text-align:center;overflow:hidden;text-overflow:ellipsis}.reading-label{font-family:inherit;display:inline-block}.reading-affix{text-decoration:none;font-size:.6em;opacity:.8;font-weight:200;padding:0 .18em}.reading-affix:first-child{padding-left:0}.reading-affix:last-child{padding-right:0}"]
            },] }
];
NgxGauge.ctorParameters = () => [
    { type: ElementRef },
    { type: Renderer2 }
];
NgxGauge.propDecorators = {
    _canvas: [{ type: ViewChild, args: ['canvas', { static: true },] }],
    _label: [{ type: ViewChild, args: ['rLabel', { static: true },] }],
    _reading: [{ type: ViewChild, args: ['reading', { static: true },] }],
    _labelChild: [{ type: ContentChild, args: [NgxGaugeLabel,] }],
    _prependChild: [{ type: ContentChild, args: [NgxGaugePrepend,] }],
    _appendChild: [{ type: ContentChild, args: [NgxGaugeAppend,] }],
    _valueDisplayChild: [{ type: ContentChild, args: [NgxGaugeValue,] }],
    ariaLabel: [{ type: Input, args: ['aria-label',] }],
    ariaLabelledby: [{ type: Input, args: ['aria-labelledby',] }],
    size: [{ type: Input }],
    min: [{ type: Input }],
    animate: [{ type: Input }],
    max: [{ type: Input }],
    type: [{ type: Input }],
    cap: [{ type: Input }],
    thick: [{ type: Input }],
    label: [{ type: Input }],
    append: [{ type: Input }],
    prepend: [{ type: Input }],
    foregroundColor: [{ type: Input }],
    backgroundColor: [{ type: Input }],
    thresholds: [{ type: Input }],
    preserveThresholds: [{ type: Input }],
    value: [{ type: Input }],
    duration: [{ type: Input }]
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2F1Z2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9wcm9qZWN0cy9uZ3gtZ2F1Z2Uvc3JjL2dhdWdlL2dhdWdlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFDSCxTQUFTLEVBQ1QsS0FBSyxFQUVMLGlCQUFpQixFQUNqQixTQUFTLEVBRVQsVUFBVSxFQUdWLFNBQVMsRUFDVCxZQUFZLEVBQ2YsTUFBTSxlQUFlLENBQUM7QUFFdkIsT0FBTyxFQUNILEtBQUssRUFDTCxxQkFBcUIsRUFDckIsb0JBQW9CLEVBQ3BCLE9BQU8sRUFDUCxRQUFRLEVBQ1gsTUFBTSxnQkFBZ0IsQ0FBQztBQUN4QixPQUFPLEVBQUUsYUFBYSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFbkcsTUFBTSxRQUFRLEdBQUc7SUFDYixHQUFHLEVBQUUsQ0FBQztJQUNOLEdBQUcsRUFBRSxHQUFHO0lBQ1IsSUFBSSxFQUFFLE1BQU07SUFDWixLQUFLLEVBQUUsQ0FBQztJQUNSLGdCQUFnQixFQUFFLHNCQUFzQjtJQUN4QyxnQkFBZ0IsRUFBRSxvQkFBb0I7SUFDdEMsR0FBRyxFQUFFLE1BQU07SUFDWCxJQUFJLEVBQUUsR0FBRztDQUNaLENBQUM7QUFzQkYsTUFBTSxPQUFPLFFBQVE7SUE4RWpCLFlBQW9CLFdBQXVCLEVBQVUsU0FBb0I7UUFBckQsZ0JBQVcsR0FBWCxXQUFXLENBQVk7UUFBVSxjQUFTLEdBQVQsU0FBUyxDQUFXO1FBbkVqRSxVQUFLLEdBQVcsUUFBUSxDQUFDLElBQUksQ0FBQztRQUM5QixTQUFJLEdBQVcsUUFBUSxDQUFDLEdBQUcsQ0FBQztRQUM1QixTQUFJLEdBQVcsUUFBUSxDQUFDLEdBQUcsQ0FBQztRQUM1QixhQUFRLEdBQVksSUFBSSxDQUFDO1FBRXpCLGlCQUFZLEdBQVksS0FBSyxDQUFDO1FBRTlCLHdCQUFtQixHQUFXLENBQUMsQ0FBQztRQUVuQixjQUFTLEdBQVcsRUFBRSxDQUFDO1FBRWxCLG1CQUFjLEdBQWtCLElBQUksQ0FBQztRQXlCdEQsU0FBSSxHQUFpQixRQUFRLENBQUMsSUFBb0IsQ0FBQztRQUVuRCxRQUFHLEdBQWdCLFFBQVEsQ0FBQyxHQUFrQixDQUFDO1FBRS9DLFVBQUssR0FBVyxRQUFRLENBQUMsS0FBSyxDQUFDO1FBUS9CLG9CQUFlLEdBQVcsUUFBUSxDQUFDLGdCQUFnQixDQUFDO1FBRXBELG9CQUFlLEdBQVcsUUFBUSxDQUFDLGdCQUFnQixDQUFDO1FBRXBELGVBQVUsR0FBVyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWxELCtGQUErRjtRQUN0Rix1QkFBa0IsR0FBVyxLQUFLLENBQUM7UUFFcEMsV0FBTSxHQUFXLENBQUMsQ0FBQztRQVFsQixhQUFRLEdBQVcsSUFBSSxDQUFDO0lBRTRDLENBQUM7SUF0RDlFLElBQ0ksSUFBSSxLQUFhLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDekMsSUFBSSxJQUFJLENBQUMsS0FBYTtRQUNsQixJQUFJLENBQUMsS0FBSyxHQUFHLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzdDLENBQUM7SUFFRCxJQUNJLEdBQUcsS0FBYSxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3ZDLElBQUksR0FBRyxDQUFDLEtBQWE7UUFDakIsSUFBSSxDQUFDLElBQUksR0FBRyxvQkFBb0IsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFDRCxJQUNJLE9BQU8sS0FBYyxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQ2hELElBQUksT0FBTyxDQUFDLEtBQUs7UUFDYixJQUFJLENBQUMsUUFBUSxHQUFHLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2pELENBQUM7SUFFRCxJQUNJLEdBQUcsS0FBYSxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3ZDLElBQUksR0FBRyxDQUFDLEtBQWE7UUFDakIsSUFBSSxDQUFDLElBQUksR0FBRyxvQkFBb0IsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzFELENBQUM7SUF5QkQsSUFDSSxLQUFLLEtBQUssT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUNuQyxJQUFJLEtBQUssQ0FBQyxHQUFXO1FBQ2pCLElBQUksQ0FBQyxNQUFNLEdBQUcsb0JBQW9CLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQU1ELFdBQVcsQ0FBQyxPQUFzQjtRQUM5QixNQUFNLHVCQUF1QixHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN6RyxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUUzRSxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUU7WUFDbkIsSUFBSSxhQUFhLEVBQUU7Z0JBQ2YsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDO2dCQUNYLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFO29CQUNsQixFQUFFLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFlBQVksQ0FBQztvQkFDbkMsRUFBRSxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxhQUFhLENBQUM7aUJBQ3ZDO2dCQUNELElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2FBQ3hCO1lBQ0QsSUFBSSx1QkFBdUIsRUFBRTtnQkFDekIsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNoQixJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7YUFDaEI7U0FDSjtJQUNMLENBQUM7SUFFTyxXQUFXO1FBQ2YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzVGLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsYUFBYSxFQUFFLFFBQVEsRUFBRSxPQUFPLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3BHLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDcEQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQzVELElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUM3QyxXQUFXLEVBQUUsYUFBYSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDO1FBQ25GLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUMvQyxXQUFXLEVBQUUsYUFBYSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUM7SUFDckYsQ0FBQztJQUVELGVBQWU7UUFDWCxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDZCxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7U0FDaEI7SUFDTCxDQUFDO0lBRUQsV0FBVztRQUNQLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNwQixDQUFDO0lBRU8sVUFBVSxDQUFDLElBQWtCO1FBQ2pDLElBQUksSUFBSSxFQUFFLElBQUksQ0FBQztRQUNmLElBQUksSUFBSSxJQUFJLE1BQU0sRUFBRTtZQUNoQixJQUFJLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNmLElBQUksR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQztTQUN0QjthQUFNLElBQUksSUFBSSxJQUFJLE1BQU0sRUFBRTtZQUN2QixJQUFJLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDckIsSUFBSSxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO1NBQ3hCO2FBQU0sSUFBSSxJQUFJLEtBQUssTUFBTSxFQUFFO1lBQ3hCLElBQUksR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNyQixJQUFJLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUM7U0FDeEI7UUFDRCxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDO0lBQzFCLENBQUM7SUFFTyxVQUFVLENBQUMsS0FBYSxFQUFFLE1BQWMsRUFBRSxJQUFZLEVBQUUsS0FBYTtRQUN6RSxJQUFJLElBQUksQ0FBQyxrQkFBa0IsRUFBRTtZQUN6QixJQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNqRCxPQUFPO1NBQ1Y7UUFFRCxJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUMsVUFBVSxFQUFFLEVBQzFCLE1BQU0sR0FBRyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7UUFFL0IsTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsaUJBQWlCO1FBQ25ELE1BQU0sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLG9CQUFvQjtRQUNyRCxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUU7WUFDbkIsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2QsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDO1lBQ2pELElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNuRSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBRXZCLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDMUIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1lBQ2xDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNwRSxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO1NBQzFCO0lBQ0wsQ0FBQztJQUVPLHNCQUFzQixDQUFDLEtBQWEsRUFBRSxZQUFvQixFQUFFLElBQVk7UUFDNUUsSUFBSSxJQUFJLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUU7WUFDdEMsSUFBSSxXQUFXLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQzFDLFNBQVMsR0FBRyxJQUFJLEdBQUcsS0FBSyxFQUN4QixZQUFZLEdBQUcsQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDLEdBQUcsU0FBUyxDQUFDO1lBRXRELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUVkLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO2dCQUN6QyxJQUFJLGVBQWUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsRUFDaEQsY0FBYyxHQUFHLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQ3hELGtCQUFrQixHQUFHLENBQUMsY0FBYyxHQUFHLGVBQWUsQ0FBQyxFQUN2RCxLQUFLLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQzdDLGFBQWEsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsSUFBSSxJQUFJLENBQUMsZUFBZSxDQUFDO2dCQUUxRixJQUFJLFlBQVksSUFBSSxlQUFlLElBQUksWUFBWSxJQUFJLGNBQWMsRUFBRTtvQkFDbkUsSUFBSSxzQkFBc0IsR0FBRyxDQUFDLFlBQVksR0FBRyxlQUFlLENBQUUsR0FBRyxrQkFBa0IsQ0FBQztvQkFDcEYsSUFBSSxZQUFZLEdBQUcsS0FBSyxHQUFHLENBQUMsU0FBUyxHQUFHLGtCQUFrQixHQUFHLHNCQUFzQixDQUFDLENBQUM7b0JBQ3JGLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLFlBQVksRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFFMUMsSUFBSSxjQUFjLEdBQUcsWUFBWSxHQUFHLENBQUMsU0FBUyxHQUFHLGtCQUFrQixHQUFHLENBQUMsQ0FBQyxHQUFHLHNCQUFzQixDQUFDLENBQUMsQ0FBQztvQkFDcEcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsY0FBYyxFQUFFLGFBQWEsQ0FBQyxDQUFDO29CQUUzRCxLQUFLLEdBQUcsY0FBYyxDQUFDO2lCQUMxQjtxQkFBTTtvQkFDSCxJQUFJLFFBQVEsR0FBRyxDQUFDLGVBQWUsSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7b0JBQ3pFLElBQUksR0FBRyxHQUFHLEtBQUssR0FBRyxDQUFDLFNBQVMsR0FBRyxrQkFBa0IsQ0FBQyxDQUFDO29CQUNuRCxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7b0JBRXBDLEtBQUssR0FBRyxHQUFHLENBQUM7aUJBQ2Y7YUFDSjtTQUNKO0lBQ0wsQ0FBQztJQUVPLFFBQVEsQ0FBQyxLQUFhLEVBQUUsR0FBVyxFQUFFLEtBQWE7UUFDdEQsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQy9CLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUMvQixJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQzFCLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztRQUNsQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUMzQixDQUFDO0lBRU8sTUFBTTtRQUNWLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLFNBQVMsRUFBRSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZFLENBQUM7SUFFTyxTQUFTO1FBQ2IsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDO0lBQ3JCLENBQUM7SUFFTyxVQUFVO1FBQ2QsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDO0lBQ3JCLENBQUM7SUFFRCwyREFBMkQ7SUFDbkQsZ0JBQWdCO1FBQ3BCLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLE1BQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxJQUFJLE1BQU0sQ0FBQztZQUMvQyxDQUFDLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLEVBQUU7WUFDMUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBRU8sVUFBVTtRQUNkLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUMvQixPQUFPLE1BQU0sQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztJQUNqQyxDQUFDO0lBRU8sVUFBVTtRQUNkLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLEVBQ3hCLENBQUMsR0FBRyxJQUFJLENBQUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQzlCLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7SUFDcEIsQ0FBQztJQUVPLEtBQUs7UUFDVCxJQUFJLENBQUMsUUFBUSxHQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBbUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkYsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUM7UUFDekIsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ25CLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNwQixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbkIsQ0FBQztJQUVPLFFBQVE7UUFDWixJQUFJLElBQUksQ0FBQyxtQkFBbUIsRUFBRTtZQUMxQixNQUFNLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7WUFDdEQsSUFBSSxDQUFDLG1CQUFtQixHQUFHLENBQUMsQ0FBQztTQUNoQztRQUNELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNkLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDO0lBQzlCLENBQUM7SUFFTyxZQUFZO1FBQ2hCLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUM7UUFDakMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQztJQUN6QyxDQUFDO0lBRU8sMEJBQTBCLENBQUMsS0FBSztRQUVwQyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUM7YUFDckMsTUFBTSxDQUFDLFVBQVUsSUFBSSxJQUFJLE9BQU8sUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLENBQUEsQ0FBQyxDQUFDLENBQUM7YUFDMUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUNyQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVsQixPQUFPLEtBQUssS0FBSyxTQUFTO1lBQ3RCLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsZUFBZTtZQUN0RCxDQUFDLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQztJQUMvQixDQUFDO0lBRU8sT0FBTyxDQUFDLEVBQVcsRUFBRSxFQUFXO1FBQ3BDLElBQUksSUFBSSxHQUFHLElBQUksRUFDWCxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksRUFDaEIsTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQzlCLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxFQUN4QixHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFDZCxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFDZCxLQUFLLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQzdDLEtBQUssR0FBRyxNQUFNLENBQUMsSUFBSSxFQUNuQixJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsRUFDaEQsWUFBWSxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsRUFDbkMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQ2xCLEtBQUssR0FBRyxJQUFJLENBQUMsMEJBQTBCLENBQUMsS0FBSyxDQUFDLEVBQzlDLFNBQVMsQ0FBQztRQUVkLElBQUksSUFBSSxDQUFDLG1CQUFtQixFQUFFO1lBQzFCLE1BQU0sQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztTQUN6RDtRQUVELFNBQVMsT0FBTyxDQUFDLFNBQVM7WUFDdEIsU0FBUyxHQUFHLFNBQVMsSUFBSSxJQUFJLElBQUksRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQzlDLElBQUksT0FBTyxHQUFHLFNBQVMsR0FBRyxTQUFTLENBQUM7WUFDcEMsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEdBQUcsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQy9DLElBQUksZ0JBQWdCLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsRCxJQUFJLE1BQU0sR0FBRyxLQUFLLEdBQUcsZ0JBQWdCLEdBQUcsWUFBWSxHQUFHLFFBQVEsQ0FBQztZQUVoRSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzVDLElBQUksSUFBSSxDQUFDLG1CQUFtQixJQUFJLENBQUMsT0FBTyxHQUFHLFFBQVEsQ0FBQyxFQUFFO2dCQUNsRCxJQUFJLENBQUMsbUJBQW1CLEdBQUcsTUFBTSxDQUFDLHFCQUFxQixDQUFDLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQzthQUM5RjtpQkFBTTtnQkFDSCxNQUFNLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7YUFDekQ7UUFDTCxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFO1lBQ2YsSUFBSSxFQUFFLElBQUksU0FBUyxJQUFJLEVBQUUsSUFBSSxTQUFTLEVBQUU7Z0JBQ3BDLFlBQVksR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7YUFDeEM7WUFDRCxJQUFJLENBQUMsbUJBQW1CLEdBQUcsTUFBTSxDQUFDLHFCQUFxQixDQUFDLENBQUMsU0FBUyxFQUFFLEVBQUU7Z0JBQ2xFLFNBQVMsR0FBRyxTQUFTLElBQUksSUFBSSxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDOUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3ZCLENBQUMsQ0FBQyxDQUFDO1NBQ047YUFBTTtZQUNILElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFFLEtBQUssR0FBRyxZQUFZLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1NBQzdEO0lBQ0wsQ0FBQztJQUVPLE9BQU8sQ0FBQyxFQUFVLEVBQUUsRUFBVTtRQUNsQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDZCxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN6QixDQUFDOzs7WUFoVkosU0FBUyxTQUFDO2dCQUNQLFFBQVEsRUFBRSxXQUFXO2dCQUNyQixrc0NBQXlCO2dCQUV6QixJQUFJLEVBQUU7b0JBQ0YsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLGVBQWUsRUFBRSxNQUFNO29CQUN2Qix5QkFBeUIsRUFBRSxNQUFNO29CQUNqQyxzQkFBc0IsRUFBRSxLQUFLO29CQUM3QixzQkFBc0IsRUFBRSxLQUFLO29CQUM3QixzQkFBc0IsRUFBRSxPQUFPO29CQUMvQixtQkFBbUIsRUFBRSxXQUFXO29CQUNoQyx3QkFBd0IsRUFBRSxnQkFBZ0I7aUJBRTdDO2dCQUNELGFBQWEsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJOzthQUN4Qzs7O1lBOUNHLFVBQVU7WUFGVixTQUFTOzs7c0JBbURSLFNBQVMsU0FBQyxRQUFRLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFO3FCQUNwQyxTQUFTLFNBQUMsUUFBUSxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRTt1QkFDcEMsU0FBUyxTQUFDLFNBQVMsRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUU7MEJBRXJDLFlBQVksU0FBQyxhQUFhOzRCQUMxQixZQUFZLFNBQUMsZUFBZTsyQkFDNUIsWUFBWSxTQUFDLGNBQWM7aUNBQzNCLFlBQVksU0FBQyxhQUFhO3dCQVcxQixLQUFLLFNBQUMsWUFBWTs2QkFFbEIsS0FBSyxTQUFDLGlCQUFpQjttQkFFdkIsS0FBSztrQkFNTCxLQUFLO3NCQUtMLEtBQUs7a0JBTUwsS0FBSzttQkFNTCxLQUFLO2tCQUVMLEtBQUs7b0JBRUwsS0FBSztvQkFFTCxLQUFLO3FCQUVMLEtBQUs7c0JBRUwsS0FBSzs4QkFFTCxLQUFLOzhCQUVMLEtBQUs7eUJBRUwsS0FBSztpQ0FHTCxLQUFLO29CQUlMLEtBQUs7dUJBTUwsS0FBSyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XHJcbiAgICBDb21wb25lbnQsXHJcbiAgICBJbnB1dCxcclxuICAgIFNpbXBsZUNoYW5nZXMsXHJcbiAgICBWaWV3RW5jYXBzdWxhdGlvbixcclxuICAgIFJlbmRlcmVyMixcclxuICAgIEFmdGVyVmlld0luaXQsXHJcbiAgICBFbGVtZW50UmVmLFxyXG4gICAgT25DaGFuZ2VzLFxyXG4gICAgT25EZXN0cm95LFxyXG4gICAgVmlld0NoaWxkLFxyXG4gICAgQ29udGVudENoaWxkXHJcbn0gZnJvbSAnQGFuZ3VsYXIvY29yZSc7XHJcbmltcG9ydCB7IE5neEdhdWdlRXJyb3IgfSBmcm9tICcuL2dhdWdlLWVycm9yJztcclxuaW1wb3J0IHtcclxuICAgIGNsYW1wLFxyXG4gICAgY29lcmNlQm9vbGVhblByb3BlcnR5LFxyXG4gICAgY29lcmNlTnVtYmVyUHJvcGVydHksXHJcbiAgICBjc3NVbml0LFxyXG4gICAgaXNOdW1iZXJcclxufSBmcm9tICcuLi9jb21tb24vdXRpbCc7XHJcbmltcG9ydCB7IE5neEdhdWdlTGFiZWwsIE5neEdhdWdlVmFsdWUsIE5neEdhdWdlUHJlcGVuZCwgTmd4R2F1Z2VBcHBlbmQgfSBmcm9tICcuL2dhdWdlLWRpcmVjdGl2ZXMnO1xyXG5cclxuY29uc3QgREVGQVVMVFMgPSB7XHJcbiAgICBNSU46IDAsXHJcbiAgICBNQVg6IDEwMCxcclxuICAgIFRZUEU6ICdhcmNoJyxcclxuICAgIFRISUNLOiA0LFxyXG4gICAgRk9SRUdST1VORF9DT0xPUjogJ3JnYmEoMCwgMTUwLCAxMzYsIDEpJyxcclxuICAgIEJBQ0tHUk9VTkRfQ09MT1I6ICdyZ2JhKDAsIDAsIDAsIDAuMSknLFxyXG4gICAgQ0FQOiAnYnV0dCcsXHJcbiAgICBTSVpFOiAyMDBcclxufTtcclxuXHJcbmV4cG9ydCB0eXBlIE5neEdhdWdlVHlwZSA9ICdmdWxsJyB8ICdhcmNoJyB8ICdzZW1pJztcclxuZXhwb3J0IHR5cGUgTmd4R2F1Z2VDYXAgPSAncm91bmQnIHwgJ2J1dHQnO1xyXG5cclxuQENvbXBvbmVudCh7XHJcbiAgICBzZWxlY3RvcjogJ25neC1nYXVnZScsXHJcbiAgICB0ZW1wbGF0ZVVybDogJ2dhdWdlLmh0bWwnLFxyXG4gICAgc3R5bGVVcmxzOiBbJ2dhdWdlLmNzcyddLFxyXG4gICAgaG9zdDoge1xyXG4gICAgICAgICdyb2xlJzogJ3NsaWRlcicsXHJcbiAgICAgICAgJ2FyaWEtcmVhZG9ubHknOiAndHJ1ZScsXHJcbiAgICAgICAgJ1tjbGFzcy5uZ3gtZ2F1Z2UtbWV0ZXJdJzogJ3RydWUnLFxyXG4gICAgICAgICdbYXR0ci5hcmlhLXZhbHVlbWluXSc6ICdtaW4nLFxyXG4gICAgICAgICdbYXR0ci5hcmlhLXZhbHVlbWF4XSc6ICdtYXgnLFxyXG4gICAgICAgICdbYXR0ci5hcmlhLXZhbHVlbm93XSc6ICd2YWx1ZScsXHJcbiAgICAgICAgJ1thdHRyLmFyaWEtbGFiZWxdJzogJ2FyaWFMYWJlbCcsXHJcbiAgICAgICAgJ1thdHRyLmFyaWEtbGFiZWxsZWRieV0nOiAnYXJpYUxhYmVsbGVkYnknXHJcblxyXG4gICAgfSxcclxuICAgIGVuY2Fwc3VsYXRpb246IFZpZXdFbmNhcHN1bGF0aW9uLk5vbmVcclxufSlcclxuZXhwb3J0IGNsYXNzIE5neEdhdWdlIGltcGxlbWVudHMgQWZ0ZXJWaWV3SW5pdCwgT25DaGFuZ2VzLCBPbkRlc3Ryb3kge1xyXG5cclxuICAgIEBWaWV3Q2hpbGQoJ2NhbnZhcycsIHsgc3RhdGljOiB0cnVlIH0pIF9jYW52YXM6IEVsZW1lbnRSZWY7XHJcbiAgICBAVmlld0NoaWxkKCdyTGFiZWwnLCB7IHN0YXRpYzogdHJ1ZSB9KSBfbGFiZWw6IEVsZW1lbnRSZWY7XHJcbiAgICBAVmlld0NoaWxkKCdyZWFkaW5nJywgeyBzdGF0aWM6IHRydWUgfSkgX3JlYWRpbmc6IEVsZW1lbnRSZWY7XHJcblxyXG4gICAgQENvbnRlbnRDaGlsZChOZ3hHYXVnZUxhYmVsKSBfbGFiZWxDaGlsZDogTmd4R2F1Z2VMYWJlbDtcclxuICAgIEBDb250ZW50Q2hpbGQoTmd4R2F1Z2VQcmVwZW5kKSBfcHJlcGVuZENoaWxkOiBOZ3hHYXVnZVByZXBlbmQ7XHJcbiAgICBAQ29udGVudENoaWxkKE5neEdhdWdlQXBwZW5kKSBfYXBwZW5kQ2hpbGQ6IE5neEdhdWdlQXBwZW5kO1xyXG4gICAgQENvbnRlbnRDaGlsZChOZ3hHYXVnZVZhbHVlKSBfdmFsdWVEaXNwbGF5Q2hpbGQ6IE5neEdhdWdlVmFsdWU7XHJcblxyXG4gICAgcHJpdmF0ZSBfc2l6ZTogbnVtYmVyID0gREVGQVVMVFMuU0laRTtcclxuICAgIHByaXZhdGUgX21pbjogbnVtYmVyID0gREVGQVVMVFMuTUlOO1xyXG4gICAgcHJpdmF0ZSBfbWF4OiBudW1iZXIgPSBERUZBVUxUUy5NQVg7XHJcbiAgICBwcml2YXRlIF9hbmltYXRlOiBib29sZWFuID0gdHJ1ZTtcclxuXHJcbiAgICBwcml2YXRlIF9pbml0aWFsaXplZDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgcHJpdmF0ZSBfY29udGV4dDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBfYW5pbWF0aW9uUmVxdWVzdElEOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIEBJbnB1dCgnYXJpYS1sYWJlbCcpIGFyaWFMYWJlbDogc3RyaW5nID0gJyc7XHJcblxyXG4gICAgQElucHV0KCdhcmlhLWxhYmVsbGVkYnknKSBhcmlhTGFiZWxsZWRieTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgQElucHV0KClcclxuICAgIGdldCBzaXplKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9zaXplOyB9XHJcbiAgICBzZXQgc2l6ZSh2YWx1ZTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5fc2l6ZSA9IGNvZXJjZU51bWJlclByb3BlcnR5KHZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICBASW5wdXQoKVxyXG4gICAgZ2V0IG1pbigpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fbWluOyB9XHJcbiAgICBzZXQgbWluKHZhbHVlOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLl9taW4gPSBjb2VyY2VOdW1iZXJQcm9wZXJ0eSh2YWx1ZSwgREVGQVVMVFMuTUlOKTtcclxuICAgIH1cclxuICAgIEBJbnB1dCgpXHJcbiAgICBnZXQgYW5pbWF0ZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2FuaW1hdGU7IH1cclxuICAgIHNldCBhbmltYXRlKHZhbHVlKSB7XHJcbiAgICAgICAgdGhpcy5fYW5pbWF0ZSA9IGNvZXJjZUJvb2xlYW5Qcm9wZXJ0eSh2YWx1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgQElucHV0KClcclxuICAgIGdldCBtYXgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX21heDsgfVxyXG4gICAgc2V0IG1heCh2YWx1ZTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5fbWF4ID0gY29lcmNlTnVtYmVyUHJvcGVydHkodmFsdWUsIERFRkFVTFRTLk1BWCk7XHJcbiAgICB9XHJcblxyXG4gICAgQElucHV0KCkgdHlwZTogTmd4R2F1Z2VUeXBlID0gREVGQVVMVFMuVFlQRSBhcyBOZ3hHYXVnZVR5cGU7XHJcblxyXG4gICAgQElucHV0KCkgY2FwOiBOZ3hHYXVnZUNhcCA9IERFRkFVTFRTLkNBUCBhcyBOZ3hHYXVnZUNhcDtcclxuXHJcbiAgICBASW5wdXQoKSB0aGljazogbnVtYmVyID0gREVGQVVMVFMuVEhJQ0s7XHJcblxyXG4gICAgQElucHV0KCkgbGFiZWw6IHN0cmluZztcclxuXHJcbiAgICBASW5wdXQoKSBhcHBlbmQ6IHN0cmluZztcclxuXHJcbiAgICBASW5wdXQoKSBwcmVwZW5kOiBzdHJpbmc7XHJcblxyXG4gICAgQElucHV0KCkgZm9yZWdyb3VuZENvbG9yOiBzdHJpbmcgPSBERUZBVUxUUy5GT1JFR1JPVU5EX0NPTE9SO1xyXG5cclxuICAgIEBJbnB1dCgpIGJhY2tncm91bmRDb2xvcjogc3RyaW5nID0gREVGQVVMVFMuQkFDS0dST1VORF9DT0xPUjtcclxuXHJcbiAgICBASW5wdXQoKSB0aHJlc2hvbGRzOiBPYmplY3QgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xyXG5cclxuICAgIC8vIElmIHNldCB0byB0cnVlLCB0aHJlc2hvbGRzIHdpbGwgcmVtYWluIHRoZWlyIGNvbG9yIGV2ZW4gaWYgdGhlIGdhdWdlIGlzIGluIGFub3RoZXIgdGhyZXNob2xkXHJcbiAgICBASW5wdXQoKSBwcmVzZXJ2ZVRocmVzaG9sZHM6IE9iamVjdCA9IGZhbHNlO1xyXG5cclxuICAgIHByaXZhdGUgX3ZhbHVlOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIEBJbnB1dCgpXHJcbiAgICBnZXQgdmFsdWUoKSB7IHJldHVybiB0aGlzLl92YWx1ZTsgfVxyXG4gICAgc2V0IHZhbHVlKHZhbDogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5fdmFsdWUgPSBjb2VyY2VOdW1iZXJQcm9wZXJ0eSh2YWwpO1xyXG4gICAgfVxyXG5cclxuICAgIEBJbnB1dCgpIGR1cmF0aW9uOiBudW1iZXIgPSAxMjAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgX2VsZW1lbnRSZWY6IEVsZW1lbnRSZWYsIHByaXZhdGUgX3JlbmRlcmVyOiBSZW5kZXJlcjIpIHsgfVxyXG5cclxuICAgIG5nT25DaGFuZ2VzKGNoYW5nZXM6IFNpbXBsZUNoYW5nZXMpIHtcclxuICAgICAgICBjb25zdCBpc0NhbnZhc1Byb3BlcnR5Q2hhbmdlZCA9IGNoYW5nZXNbJ3RoaWNrJ10gfHwgY2hhbmdlc1sndHlwZSddIHx8IGNoYW5nZXNbJ2NhcCddIHx8IGNoYW5nZXNbJ3NpemUnXTtcclxuICAgICAgICBjb25zdCBpc0RhdGFDaGFuZ2VkID0gY2hhbmdlc1sndmFsdWUnXSB8fCBjaGFuZ2VzWydtaW4nXSB8fCBjaGFuZ2VzWydtYXgnXTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuX2luaXRpYWxpemVkKSB7XHJcbiAgICAgICAgICAgIGlmIChpc0RhdGFDaGFuZ2VkKSB7XHJcbiAgICAgICAgICAgICAgICBsZXQgbnYsIG92O1xyXG4gICAgICAgICAgICAgICAgaWYgKGNoYW5nZXNbJ3ZhbHVlJ10pIHtcclxuICAgICAgICAgICAgICAgICAgICBudiA9IGNoYW5nZXNbJ3ZhbHVlJ10uY3VycmVudFZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIG92ID0gY2hhbmdlc1sndmFsdWUnXS5wcmV2aW91c1ZhbHVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdGhpcy5fdXBkYXRlKG52LCBvdik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGlzQ2FudmFzUHJvcGVydHlDaGFuZ2VkKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9kZXN0cm95KCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9pbml0KCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBfdXBkYXRlU2l6ZSgpIHtcclxuICAgICAgICB0aGlzLl9yZW5kZXJlci5zZXRTdHlsZSh0aGlzLl9lbGVtZW50UmVmLm5hdGl2ZUVsZW1lbnQsICd3aWR0aCcsIGNzc1VuaXQodGhpcy5fZ2V0V2lkdGgoKSkpO1xyXG4gICAgICAgIHRoaXMuX3JlbmRlcmVyLnNldFN0eWxlKHRoaXMuX2VsZW1lbnRSZWYubmF0aXZlRWxlbWVudCwgJ2hlaWdodCcsIGNzc1VuaXQodGhpcy5fZ2V0Q2FudmFzSGVpZ2h0KCkpKTtcclxuICAgICAgICB0aGlzLl9jYW52YXMubmF0aXZlRWxlbWVudC53aWR0aCA9IHRoaXMuX2dldFdpZHRoKCk7XHJcbiAgICAgICAgdGhpcy5fY2FudmFzLm5hdGl2ZUVsZW1lbnQuaGVpZ2h0ID0gdGhpcy5fZ2V0Q2FudmFzSGVpZ2h0KCk7XHJcbiAgICAgICAgdGhpcy5fcmVuZGVyZXIuc2V0U3R5bGUodGhpcy5fbGFiZWwubmF0aXZlRWxlbWVudCxcclxuICAgICAgICAgICAgJ3RyYW5zZm9ybScsICd0cmFuc2xhdGVZKCcgKyAodGhpcy5zaXplIC8gMyAqIDIgLSB0aGlzLnNpemUgLyAxMyAvIDQpICsgJ3B4KScpO1xyXG4gICAgICAgIHRoaXMuX3JlbmRlcmVyLnNldFN0eWxlKHRoaXMuX3JlYWRpbmcubmF0aXZlRWxlbWVudCxcclxuICAgICAgICAgICAgJ3RyYW5zZm9ybScsICd0cmFuc2xhdGVZKCcgKyAodGhpcy5zaXplIC8gMiAtIHRoaXMuc2l6ZSAqIDAuMjIgLyAyKSArICdweCknKTtcclxuICAgIH1cclxuXHJcbiAgICBuZ0FmdGVyVmlld0luaXQoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2NhbnZhcykge1xyXG4gICAgICAgICAgICB0aGlzLl9pbml0KCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIG5nT25EZXN0cm95KCkge1xyXG4gICAgICAgIHRoaXMuX2Rlc3Ryb3koKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9nZXRCb3VuZHModHlwZTogTmd4R2F1Z2VUeXBlKSB7XHJcbiAgICAgICAgbGV0IGhlYWQsIHRhaWw7XHJcbiAgICAgICAgaWYgKHR5cGUgPT0gJ3NlbWknKSB7XHJcbiAgICAgICAgICAgIGhlYWQgPSBNYXRoLlBJO1xyXG4gICAgICAgICAgICB0YWlsID0gMiAqIE1hdGguUEk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlID09ICdmdWxsJykge1xyXG4gICAgICAgICAgICBoZWFkID0gMS41ICogTWF0aC5QSTtcclxuICAgICAgICAgICAgdGFpbCA9IDMuNSAqIE1hdGguUEk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnYXJjaCcpIHtcclxuICAgICAgICAgICAgaGVhZCA9IDAuOCAqIE1hdGguUEk7XHJcbiAgICAgICAgICAgIHRhaWwgPSAyLjIgKiBNYXRoLlBJO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4geyBoZWFkLCB0YWlsIH07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBfZHJhd1NoZWxsKHN0YXJ0OiBudW1iZXIsIG1pZGRsZTogbnVtYmVyLCB0YWlsOiBudW1iZXIsIGNvbG9yOiBzdHJpbmcpIHtcclxuICAgICAgICBpZiAodGhpcy5wcmVzZXJ2ZVRocmVzaG9sZHMpIHtcclxuICAgICAgICAgICAgdGhpcy5fZHJhd1NoZWxsV2l0aFNlZ21lbnRzKHN0YXJ0LCBtaWRkbGUsIHRhaWwpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgY2VudGVyID0gdGhpcy5fZ2V0Q2VudGVyKCksXHJcbiAgICAgICAgICAgIHJhZGl1cyA9IHRoaXMuX2dldFJhZGl1cygpO1xyXG5cclxuICAgICAgICBtaWRkbGUgPSBNYXRoLm1heChtaWRkbGUsIHN0YXJ0KTsgLy8gbmV2ZXIgYmVsb3cgMCVcclxuICAgICAgICBtaWRkbGUgPSBNYXRoLm1pbihtaWRkbGUsIHRhaWwpOyAvLyBuZXZlciBleGNlZWQgMTAwJVxyXG4gICAgICAgIGlmICh0aGlzLl9pbml0aWFsaXplZCkge1xyXG4gICAgICAgICAgICB0aGlzLl9jbGVhcigpO1xyXG4gICAgICAgICAgICB0aGlzLl9jb250ZXh0LmJlZ2luUGF0aCgpO1xyXG4gICAgICAgICAgICB0aGlzLl9jb250ZXh0LnN0cm9rZVN0eWxlID0gdGhpcy5iYWNrZ3JvdW5kQ29sb3I7XHJcbiAgICAgICAgICAgIHRoaXMuX2NvbnRleHQuYXJjKGNlbnRlci54LCBjZW50ZXIueSwgcmFkaXVzLCBtaWRkbGUsIHRhaWwsIGZhbHNlKTtcclxuICAgICAgICAgICAgdGhpcy5fY29udGV4dC5zdHJva2UoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuX2NvbnRleHQuYmVnaW5QYXRoKCk7XHJcbiAgICAgICAgICAgIHRoaXMuX2NvbnRleHQuc3Ryb2tlU3R5bGUgPSBjb2xvcjtcclxuICAgICAgICAgICAgdGhpcy5fY29udGV4dC5hcmMoY2VudGVyLngsIGNlbnRlci55LCByYWRpdXMsIHN0YXJ0LCBtaWRkbGUsIGZhbHNlKTtcclxuICAgICAgICAgICAgdGhpcy5fY29udGV4dC5zdHJva2UoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBfZHJhd1NoZWxsV2l0aFNlZ21lbnRzKHN0YXJ0OiBudW1iZXIsIGN1cnJlbnRWYWx1ZTogbnVtYmVyLCB0YWlsOiBudW1iZXIpIHtcclxuICAgICAgICBpZiAodGhpcy50aHJlc2hvbGRzICYmIHRoaXMuX2luaXRpYWxpemVkKSB7XHJcbiAgICAgICAgICAgIGxldCBwZXJjZW50YWdlcyA9IE9iamVjdC5rZXlzKHRoaXMudGhyZXNob2xkcyksXHJcbiAgICAgICAgICAgICAgICBhcmNMZW5ndGggPSB0YWlsIC0gc3RhcnQsXHJcbiAgICAgICAgICAgICAgICB2YWx1ZVBlcmNlbnQgPSAoY3VycmVudFZhbHVlIC0gc3RhcnQpIC8gYXJjTGVuZ3RoO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5fY2xlYXIoKTtcclxuXHJcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGVyY2VudGFnZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIGxldCBzdGFydFBlcmNlbnRhZ2UgPSAoTnVtYmVyKHBlcmNlbnRhZ2VzW2ldKSAvIDEwMCksXHJcbiAgICAgICAgICAgICAgICAgICAgbmV4dFBlcmNlbnRhZ2UgPSAoTnVtYmVyKHBlcmNlbnRhZ2VzW2kgKyAxXSkgLyAxMDApIHx8IDEsXHJcbiAgICAgICAgICAgICAgICAgICAgcGVyY2VudGFnZVRvVHJhdmVsID0gKG5leHRQZXJjZW50YWdlIC0gc3RhcnRQZXJjZW50YWdlKSxcclxuICAgICAgICAgICAgICAgICAgICBjb2xvciA9IHRoaXMudGhyZXNob2xkc1twZXJjZW50YWdlc1tpXV0uY29sb3IsXHJcbiAgICAgICAgICAgICAgICAgICAgZmFsbGJhY2tDb2xvciA9IHRoaXMudGhyZXNob2xkc1twZXJjZW50YWdlc1tpXV0uZmFsbGJhY2tDb2xvciB8fCB0aGlzLmJhY2tncm91bmRDb2xvcjtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAodmFsdWVQZXJjZW50ID49IHN0YXJ0UGVyY2VudGFnZSAmJiB2YWx1ZVBlcmNlbnQgPD0gbmV4dFBlcmNlbnRhZ2UpIHtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgcGVyY2VudGFnZU9mQ3VycmVudEFyYyA9ICh2YWx1ZVBlcmNlbnQgLSBzdGFydFBlcmNlbnRhZ2UgKSAvIHBlcmNlbnRhZ2VUb1RyYXZlbDtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgYWN0aXZlQXJjRW5kID0gc3RhcnQgKyAoYXJjTGVuZ3RoICogcGVyY2VudGFnZVRvVHJhdmVsICogcGVyY2VudGFnZU9mQ3VycmVudEFyYyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZHJhd0FyYyhzdGFydCwgYWN0aXZlQXJjRW5kLCBjb2xvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IGluYWN0aXZlQXJjRW5kID0gYWN0aXZlQXJjRW5kICsgKGFyY0xlbmd0aCAqIHBlcmNlbnRhZ2VUb1RyYXZlbCAqICgxIC0gcGVyY2VudGFnZU9mQ3VycmVudEFyYykpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2RyYXdBcmMoYWN0aXZlQXJjRW5kLCBpbmFjdGl2ZUFyY0VuZCwgZmFsbGJhY2tDb2xvcik7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0ID0gaW5hY3RpdmVBcmNFbmQ7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGxldCBhcmNDb2xvciA9IChzdGFydFBlcmNlbnRhZ2UgPj0gdmFsdWVQZXJjZW50KSA/IGZhbGxiYWNrQ29sb3IgOiBjb2xvcjtcclxuICAgICAgICAgICAgICAgICAgICBsZXQgZW5kID0gc3RhcnQgKyAoYXJjTGVuZ3RoICogcGVyY2VudGFnZVRvVHJhdmVsKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9kcmF3QXJjKHN0YXJ0LCBlbmQsIGFyY0NvbG9yKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgc3RhcnQgPSBlbmQ7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBfZHJhd0FyYyhzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlciwgY29sb3I6IHN0cmluZykge1xyXG4gICAgICAgIGxldCBjZW50ZXIgPSB0aGlzLl9nZXRDZW50ZXIoKTtcclxuICAgICAgICBsZXQgcmFkaXVzID0gdGhpcy5fZ2V0UmFkaXVzKCk7XHJcbiAgICAgICAgdGhpcy5fY29udGV4dC5iZWdpblBhdGgoKTtcclxuICAgICAgICB0aGlzLl9jb250ZXh0LnN0cm9rZVN0eWxlID0gY29sb3I7XHJcbiAgICAgICAgdGhpcy5fY29udGV4dC5hcmMoY2VudGVyLngsIGNlbnRlci55LCByYWRpdXMsIHN0YXJ0LCBlbmQsIGZhbHNlKTtcclxuICAgICAgICB0aGlzLl9jb250ZXh0LnN0cm9rZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX2NsZWFyKCkge1xyXG4gICAgICAgIHRoaXMuX2NvbnRleHQuY2xlYXJSZWN0KDAsIDAsIHRoaXMuX2dldFdpZHRoKCksIHRoaXMuX2dldEhlaWdodCgpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9nZXRXaWR0aCgpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5zaXplO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX2dldEhlaWdodCgpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5zaXplO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIGNhbnZhcyBoZWlnaHQgd2lsbCBiZSBzaG9ydGVyIGZvciB0eXBlICdzZW1pJyBhbmQgJ2FyY2gnXHJcbiAgICBwcml2YXRlIF9nZXRDYW52YXNIZWlnaHQoKSB7XHJcbiAgICAgICAgcmV0dXJuICh0aGlzLnR5cGUgPT0gJ2FyY2gnIHx8IHRoaXMudHlwZSA9PSAnc2VtaScpXHJcbiAgICAgICAgICAgID8gMC44NSAqIHRoaXMuX2dldEhlaWdodCgpXHJcbiAgICAgICAgICAgIDogdGhpcy5fZ2V0SGVpZ2h0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBfZ2V0UmFkaXVzKCkge1xyXG4gICAgICAgIHZhciBjZW50ZXIgPSB0aGlzLl9nZXRDZW50ZXIoKTtcclxuICAgICAgICByZXR1cm4gY2VudGVyLnggLSB0aGlzLnRoaWNrO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX2dldENlbnRlcigpIHtcclxuICAgICAgICB2YXIgeCA9IHRoaXMuX2dldFdpZHRoKCkgLyAyLFxyXG4gICAgICAgICAgICB5ID0gdGhpcy5fZ2V0SGVpZ2h0KCkgLyAyO1xyXG4gICAgICAgIHJldHVybiB7IHgsIHkgfTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9pbml0KCkge1xyXG4gICAgICAgIHRoaXMuX2NvbnRleHQgPSAodGhpcy5fY2FudmFzLm5hdGl2ZUVsZW1lbnQgYXMgSFRNTENhbnZhc0VsZW1lbnQpLmdldENvbnRleHQoJzJkJyk7XHJcbiAgICAgICAgdGhpcy5faW5pdGlhbGl6ZWQgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuX3VwZGF0ZVNpemUoKTtcclxuICAgICAgICB0aGlzLl9zZXR1cFN0eWxlcygpO1xyXG4gICAgICAgIHRoaXMuX2NyZWF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX2Rlc3Ryb3koKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuX2FuaW1hdGlvblJlcXVlc3RJRCkge1xyXG4gICAgICAgICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy5fYW5pbWF0aW9uUmVxdWVzdElEKTtcclxuICAgICAgICAgICAgdGhpcy5fYW5pbWF0aW9uUmVxdWVzdElEID0gMDtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5fY2xlYXIoKTtcclxuICAgICAgICB0aGlzLl9jb250ZXh0ID0gbnVsbDtcclxuICAgICAgICB0aGlzLl9pbml0aWFsaXplZCA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX3NldHVwU3R5bGVzKCkge1xyXG4gICAgICAgIHRoaXMuX2NvbnRleHQubGluZUNhcCA9IHRoaXMuY2FwO1xyXG4gICAgICAgIHRoaXMuX2NvbnRleHQubGluZVdpZHRoID0gdGhpcy50aGljaztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9nZXRGb3JlZ3JvdW5kQ29sb3JCeVJhbmdlKHZhbHVlKSB7XHJcblxyXG4gICAgICAgIGNvbnN0IG1hdGNoID0gT2JqZWN0LmtleXModGhpcy50aHJlc2hvbGRzKVxyXG4gICAgICAgICAgICAuZmlsdGVyKGZ1bmN0aW9uIChpdGVtKSB7IHJldHVybiBpc051bWJlcihpdGVtKSAmJiBOdW1iZXIoaXRlbSkgPD0gdmFsdWUgfSlcclxuICAgICAgICAgICAgLnNvcnQoKGEsIGIpID0+IE51bWJlcihhKSAtIE51bWJlcihiKSlcclxuICAgICAgICAgICAgLnJldmVyc2UoKVswXTtcclxuXHJcbiAgICAgICAgcmV0dXJuIG1hdGNoICE9PSB1bmRlZmluZWRcclxuICAgICAgICAgICAgPyB0aGlzLnRocmVzaG9sZHNbbWF0Y2hdLmNvbG9yIHx8IHRoaXMuZm9yZWdyb3VuZENvbG9yXHJcbiAgICAgICAgICAgIDogdGhpcy5mb3JlZ3JvdW5kQ29sb3I7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBfY3JlYXRlKG52PzogbnVtYmVyLCBvdj86IG51bWJlcikge1xyXG4gICAgICAgIGxldCBzZWxmID0gdGhpcyxcclxuICAgICAgICAgICAgdHlwZSA9IHRoaXMudHlwZSxcclxuICAgICAgICAgICAgYm91bmRzID0gdGhpcy5fZ2V0Qm91bmRzKHR5cGUpLFxyXG4gICAgICAgICAgICBkdXJhdGlvbiA9IHRoaXMuZHVyYXRpb24sXHJcbiAgICAgICAgICAgIG1pbiA9IHRoaXMubWluLFxyXG4gICAgICAgICAgICBtYXggPSB0aGlzLm1heCxcclxuICAgICAgICAgICAgdmFsdWUgPSBjbGFtcCh0aGlzLnZhbHVlLCB0aGlzLm1pbiwgdGhpcy5tYXgpLFxyXG4gICAgICAgICAgICBzdGFydCA9IGJvdW5kcy5oZWFkLFxyXG4gICAgICAgICAgICB1bml0ID0gKGJvdW5kcy50YWlsIC0gYm91bmRzLmhlYWQpIC8gKG1heCAtIG1pbiksXHJcbiAgICAgICAgICAgIGRpc3BsYWNlbWVudCA9IHVuaXQgKiAodmFsdWUgLSBtaW4pLFxyXG4gICAgICAgICAgICB0YWlsID0gYm91bmRzLnRhaWwsXHJcbiAgICAgICAgICAgIGNvbG9yID0gdGhpcy5fZ2V0Rm9yZWdyb3VuZENvbG9yQnlSYW5nZSh2YWx1ZSksXHJcbiAgICAgICAgICAgIHN0YXJ0VGltZTtcclxuXHJcbiAgICAgICAgaWYgKHNlbGYuX2FuaW1hdGlvblJlcXVlc3RJRCkge1xyXG4gICAgICAgICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUoc2VsZi5fYW5pbWF0aW9uUmVxdWVzdElEKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZ1bmN0aW9uIGFuaW1hdGUodGltZXN0YW1wKSB7XHJcbiAgICAgICAgICAgIHRpbWVzdGFtcCA9IHRpbWVzdGFtcCB8fCBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcclxuICAgICAgICAgICAgbGV0IHJ1bnRpbWUgPSB0aW1lc3RhbXAgLSBzdGFydFRpbWU7XHJcbiAgICAgICAgICAgIGxldCBwcm9ncmVzcyA9IE1hdGgubWluKHJ1bnRpbWUgLyBkdXJhdGlvbiwgMSk7XHJcbiAgICAgICAgICAgIGxldCBwcmV2aW91c1Byb2dyZXNzID0gb3YgPyAob3YgLSBtaW4pICogdW5pdCA6IDA7XHJcbiAgICAgICAgICAgIGxldCBtaWRkbGUgPSBzdGFydCArIHByZXZpb3VzUHJvZ3Jlc3MgKyBkaXNwbGFjZW1lbnQgKiBwcm9ncmVzcztcclxuXHJcbiAgICAgICAgICAgIHNlbGYuX2RyYXdTaGVsbChzdGFydCwgbWlkZGxlLCB0YWlsLCBjb2xvcik7XHJcbiAgICAgICAgICAgIGlmIChzZWxmLl9hbmltYXRpb25SZXF1ZXN0SUQgJiYgKHJ1bnRpbWUgPCBkdXJhdGlvbikpIHtcclxuICAgICAgICAgICAgICAgIHNlbGYuX2FuaW1hdGlvblJlcXVlc3RJRCA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKHRpbWVzdGFtcCkgPT4gYW5pbWF0ZSh0aW1lc3RhbXApKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZShzZWxmLl9hbmltYXRpb25SZXF1ZXN0SUQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLl9hbmltYXRlKSB7XHJcbiAgICAgICAgICAgIGlmIChudiAhPSB1bmRlZmluZWQgJiYgb3YgIT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBkaXNwbGFjZW1lbnQgPSB1bml0ICogbnYgLSB1bml0ICogb3Y7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgc2VsZi5fYW5pbWF0aW9uUmVxdWVzdElEID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgodGltZXN0YW1wKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBzdGFydFRpbWUgPSB0aW1lc3RhbXAgfHwgbmV3IERhdGUoKS5nZXRUaW1lKCk7XHJcbiAgICAgICAgICAgICAgICBhbmltYXRlKHN0YXJ0VGltZSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHNlbGYuX2RyYXdTaGVsbChzdGFydCwgc3RhcnQgKyBkaXNwbGFjZW1lbnQsIHRhaWwsIGNvbG9yKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBfdXBkYXRlKG52OiBudW1iZXIsIG92OiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLl9jbGVhcigpO1xyXG4gICAgICAgIHRoaXMuX2NyZWF0ZShudiwgb3YpO1xyXG4gICAgfVxyXG5cclxufVxyXG4iXX0=
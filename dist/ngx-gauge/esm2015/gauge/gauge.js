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
        this.shadowColor = '';
        this.foregroundColor = DEFAULTS.FOREGROUND_COLOR;
        this.backgroundColor = DEFAULTS.BACKGROUND_COLOR;
        this.thresholds = Object.create(null);
        // If set to true, thresholds will remain their color even if the gauge is in another threshold
        this.preserveThresholds = false;
        this.thumb = false;
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
            let thumbColor = this.backgroundColor;
            for (let i = 0; i < percentages.length; i++) {
                let startPercentage = (Number(percentages[i]) / 100), nextPercentage = (Number(percentages[i + 1]) / 100) || 1, percentageToTravel = (nextPercentage - startPercentage), color = this.thresholds[percentages[i]].color, fallbackColor = this.thresholds[percentages[i]].fallbackColor || this.backgroundColor;
                if (valuePercent >= startPercentage && valuePercent <= nextPercentage) {
                    let percentageOfCurrentArc = (valuePercent - startPercentage) / percentageToTravel;
                    let activeArcEnd = start + (arcLength * percentageToTravel * percentageOfCurrentArc);
                    thumbColor = color;
                    this._drawArc(start, activeArcEnd, color);
                    if (this.shadowColor) {
                        this._drawArcShadow(start, activeArcEnd, this.shadowColor);
                    }
                    let inactiveArcEnd = activeArcEnd + (arcLength * percentageToTravel * (1 - percentageOfCurrentArc));
                    this._drawArc(activeArcEnd, inactiveArcEnd, fallbackColor);
                    if (this.shadowColor) {
                        this._drawArcShadow(activeArcEnd, inactiveArcEnd, this.shadowColor);
                    }
                    start = inactiveArcEnd;
                }
                else {
                    let arcColor = (startPercentage >= valuePercent) ? fallbackColor : color;
                    let end = start + (arcLength * percentageToTravel);
                    this._drawArc(start, end, arcColor);
                    if (this.shadowColor) {
                        this._drawArcShadow(start, end, this.shadowColor);
                    }
                    start = end;
                }
            }
            if (this.thumb) {
                this._drawThumb(currentValue, thumbColor);
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
    _drawArcShadow(start, end, color) {
        let center = this._getCenter();
        let radius = this._getRadius() * 0.89;
        this._context.beginPath();
        this._context.strokeStyle = color;
        this._context.arc(center.x, center.y, radius, start, end, false);
        this._context.stroke();
    }
    _drawThumb(valuePercent, color) {
        let radius = this.thick * 0.8;
        let x = (this._getRadius() * Math.cos(valuePercent)) + (this._getWidth() / 2);
        let y = (this._getRadius() * Math.sin(valuePercent)) + (this._getHeight() / 2);
        this._context.beginPath();
        this._context.arc(x, y, radius, 0, 2 * Math.PI, false);
        this._context.fillStyle = "#fff";
        this._context.fill();
        this._context.lineWidth = this.thick / 3;
        this._context.strokeStyle = color;
        this._context.stroke();
        this._context.lineWidth = this.thick;
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
    shadowColor: [{ type: Input }],
    foregroundColor: [{ type: Input }],
    backgroundColor: [{ type: Input }],
    thresholds: [{ type: Input }],
    preserveThresholds: [{ type: Input }],
    thumb: [{ type: Input }],
    value: [{ type: Input }],
    duration: [{ type: Input }]
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2F1Z2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9wcm9qZWN0cy9uZ3gtZ2F1Z2Uvc3JjL2dhdWdlL2dhdWdlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFDTCxTQUFTLEVBQ1QsS0FBSyxFQUVMLGlCQUFpQixFQUNqQixTQUFTLEVBRVQsVUFBVSxFQUdWLFNBQVMsRUFDVCxZQUFZLEVBQ2IsTUFBTSxlQUFlLENBQUM7QUFFdkIsT0FBTyxFQUNMLEtBQUssRUFDTCxxQkFBcUIsRUFDckIsb0JBQW9CLEVBQ3BCLE9BQU8sRUFDUCxRQUFRLEVBQ1QsTUFBTSxnQkFBZ0IsQ0FBQztBQUN4QixPQUFPLEVBQUUsYUFBYSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFbkcsTUFBTSxRQUFRLEdBQUc7SUFDZixHQUFHLEVBQUUsQ0FBQztJQUNOLEdBQUcsRUFBRSxHQUFHO0lBQ1IsSUFBSSxFQUFFLE1BQU07SUFDWixLQUFLLEVBQUUsQ0FBQztJQUNSLGdCQUFnQixFQUFFLHNCQUFzQjtJQUN4QyxnQkFBZ0IsRUFBRSxvQkFBb0I7SUFDdEMsR0FBRyxFQUFFLE1BQU07SUFDWCxJQUFJLEVBQUUsR0FBRztDQUNWLENBQUM7QUFzQkYsTUFBTSxPQUFPLFFBQVE7SUFrRm5CLFlBQW9CLFdBQXVCLEVBQVUsU0FBb0I7UUFBckQsZ0JBQVcsR0FBWCxXQUFXLENBQVk7UUFBVSxjQUFTLEdBQVQsU0FBUyxDQUFXO1FBdkVqRSxVQUFLLEdBQVcsUUFBUSxDQUFDLElBQUksQ0FBQztRQUM5QixTQUFJLEdBQVcsUUFBUSxDQUFDLEdBQUcsQ0FBQztRQUM1QixTQUFJLEdBQVcsUUFBUSxDQUFDLEdBQUcsQ0FBQztRQUM1QixhQUFRLEdBQVksSUFBSSxDQUFDO1FBRXpCLGlCQUFZLEdBQVksS0FBSyxDQUFDO1FBRTlCLHdCQUFtQixHQUFXLENBQUMsQ0FBQztRQUVuQixj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c0IsRUFBRSxPQUFPO29CQUMvQixtQkFBbUIsRUFBRSxXQUFXO29CQUNoQyx3QkFBd0IsRUFBRSxnQkFBZ0I7aUJBRTNDO2dCQUNELGFBQWEsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJOzthQUN0Qzs7O1lBOUNDLFVBQVU7WUFGVixTQUFTOzs7c0JBbURSLFNBQVMsU0FBQyxRQUFRLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFO3FCQUNwQyxTQUFTLFNBQUMsUUFBUSxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRTt1QkFDcEMsU0FBUyxTQUFDLFNBQVMsRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUU7MEJBRXJDLFlBQVksU0FBQyxhQUFhOzRCQUMxQixZQUFZLFNBQUMsZUFBZTsyQkFDNUIsWUFBWSxTQUFDLGNBQWM7aUNBQzNCLFlBQVksU0FBQyxhQUFhO3dCQVcxQixLQUFLLFNBQUMsWUFBWTs2QkFFbEIsS0FBSyxTQUFDLGlCQUFpQjttQkFFdkIsS0FBSztrQkFNTCxLQUFLO3NCQUtMLEtBQUs7a0JBTUwsS0FBSzttQkFNTCxLQUFLO2tCQUVMLEtBQUs7b0JBRUwsS0FBSztvQkFFTCxLQUFLO3FCQUVMLEtBQUs7c0JBRUwsS0FBSzswQkFFTCxLQUFLOzhCQUVMLEtBQUs7OEJBRUwsS0FBSzt5QkFFTCxLQUFLO2lDQUdMLEtBQUs7b0JBRUwsS0FBSztvQkFJTCxLQUFLO3VCQU1MLEtBQUsiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xyXG4gIENvbXBvbmVudCxcclxuICBJbnB1dCxcclxuICBTaW1wbGVDaGFuZ2VzLFxyXG4gIFZpZXdFbmNhcHN1bGF0aW9uLFxyXG4gIFJlbmRlcmVyMixcclxuICBBZnRlclZpZXdJbml0LFxyXG4gIEVsZW1lbnRSZWYsXHJcbiAgT25DaGFuZ2VzLFxyXG4gIE9uRGVzdHJveSxcclxuICBWaWV3Q2hpbGQsXHJcbiAgQ29udGVudENoaWxkXHJcbn0gZnJvbSAnQGFuZ3VsYXIvY29yZSc7XHJcbmltcG9ydCB7IE5neEdhdWdlRXJyb3IgfSBmcm9tICcuL2dhdWdlLWVycm9yJztcclxuaW1wb3J0IHtcclxuICBjbGFtcCxcclxuICBjb2VyY2VCb29sZWFuUHJvcGVydHksXHJcbiAgY29lcmNlTnVtYmVyUHJvcGVydHksXHJcbiAgY3NzVW5pdCxcclxuICBpc051bWJlclxyXG59IGZyb20gJy4uL2NvbW1vbi91dGlsJztcclxuaW1wb3J0IHsgTmd4R2F1Z2VMYWJlbCwgTmd4R2F1Z2VWYWx1ZSwgTmd4R2F1Z2VQcmVwZW5kLCBOZ3hHYXVnZUFwcGVuZCB9IGZyb20gJy4vZ2F1Z2UtZGlyZWN0aXZlcyc7XHJcblxyXG5jb25zdCBERUZBVUxUUyA9IHtcclxuICBNSU46IDAsXHJcbiAgTUFYOiAxMDAsXHJcbiAgVFlQRTogJ2FyY2gnLFxyXG4gIFRISUNLOiA0LFxyXG4gIEZPUkVHUk9VTkRfQ09MT1I6ICdyZ2JhKDAsIDE1MCwgMTM2LCAxKScsXHJcbiAgQkFDS0dST1VORF9DT0xPUjogJ3JnYmEoMCwgMCwgMCwgMC4xKScsXHJcbiAgQ0FQOiAnYnV0dCcsXHJcbiAgU0laRTogMjAwXHJcbn07XHJcblxyXG5leHBvcnQgdHlwZSBOZ3hHYXVnZVR5cGUgPSAnZnVsbCcgfCAnYXJjaCcgfCAnc2VtaSc7XHJcbmV4cG9ydCB0eXBlIE5neEdhdWdlQ2FwID0gJ3JvdW5kJyB8ICdidXR0JztcclxuXHJcbkBDb21wb25lbnQoe1xyXG4gIHNlbGVjdG9yOiAnbmd4LWdhdWdlJyxcclxuICB0ZW1wbGF0ZVVybDogJ2dhdWdlLmh0bWwnLFxyXG4gIHN0eWxlVXJsczogWydnYXVnZS5jc3MnXSxcclxuICBob3N0OiB7XHJcbiAgICAncm9sZSc6ICdzbGlkZXInLFxyXG4gICAgJ2FyaWEtcmVhZG9ubHknOiAndHJ1ZScsXHJcbiAgICAnW2NsYXNzLm5neC1nYXVnZS1tZXRlcl0nOiAndHJ1ZScsXHJcbiAgICAnW2F0dHIuYXJpYS12YWx1ZW1pbl0nOiAnbWluJyxcclxuICAgICdbYXR0ci5hcmlhLXZhbHVlbWF4XSc6ICdtYXgnLFxyXG4gICAgJ1thdHRyLmFyaWEtdmFsdWVub3ddJzogJ3ZhbHVlJyxcclxuICAgICdbYXR0ci5hcmlhLWxhYmVsXSc6ICdhcmlhTGFiZWwnLFxyXG4gICAgJ1thdHRyLmFyaWEtbGFiZWxsZWRieV0nOiAnYXJpYUxhYmVsbGVkYnknXHJcblxyXG4gIH0sXHJcbiAgZW5jYXBzdWxhdGlvbjogVmlld0VuY2Fwc3VsYXRpb24uTm9uZVxyXG59KVxyXG5leHBvcnQgY2xhc3MgTmd4R2F1Z2UgaW1wbGVtZW50cyBBZnRlclZpZXdJbml0LCBPbkNoYW5nZXMsIE9uRGVzdHJveSB7XHJcblxyXG4gIEBWaWV3Q2hpbGQoJ2NhbnZhcycsIHsgc3RhdGljOiB0cnVlIH0pIF9jYW52YXM6IEVsZW1lbnRSZWY7XHJcbiAgQFZpZXdDaGlsZCgnckxhYmVsJywgeyBzdGF0aWM6IHRydWUgfSkgX2xhYmVsOiBFbGVtZW50UmVmO1xyXG4gIEBWaWV3Q2hpbGQoJ3JlYWRpbmcnLCB7IHN0YXRpYzogdHJ1ZSB9KSBfcmVhZGluZzogRWxlbWVudFJlZjtcclxuXHJcbiAgQENvbnRlbnRDaGlsZChOZ3hHYXVnZUxhYmVsKSBfbGFiZWxDaGlsZDogTmd4R2F1Z2VMYWJlbDtcclxuICBAQ29udGVudENoaWxkKE5neEdhdWdlUHJlcGVuZCkgX3ByZXBlbmRDaGlsZDogTmd4R2F1Z2VQcmVwZW5kO1xyXG4gIEBDb250ZW50Q2hpbGQoTmd4R2F1Z2VBcHBlbmQpIF9hcHBlbmRDaGlsZDogTmd4R2F1Z2VBcHBlbmQ7XHJcbiAgQENvbnRlbnRDaGlsZChOZ3hHYXVnZVZhbHVlKSBfdmFsdWVEaXNwbGF5Q2hpbGQ6IE5neEdhdWdlVmFsdWU7XHJcblxyXG4gIHByaXZhdGUgX3NpemU6IG51bWJlciA9IERFRkFVTFRTLlNJWkU7XHJcbiAgcHJpdmF0ZSBfbWluOiBudW1iZXIgPSBERUZBVUxUUy5NSU47XHJcbiAgcHJpdmF0ZSBfbWF4OiBudW1iZXIgPSBERUZBVUxUUy5NQVg7XHJcbiAgcHJpdmF0ZSBfYW5pbWF0ZTogYm9vbGVhbiA9IHRydWU7XHJcblxyXG4gIHByaXZhdGUgX2luaXRpYWxpemVkOiBib29sZWFuID0gZmFsc2U7XHJcbiAgcHJpdmF0ZSBfY29udGV4dDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gIHByaXZhdGUgX2FuaW1hdGlvblJlcXVlc3RJRDogbnVtYmVyID0gMDtcclxuXHJcbiAgQElucHV0KCdhcmlhLWxhYmVsJykgYXJpYUxhYmVsOiBzdHJpbmcgPSAnJztcclxuXHJcbiAgQElucHV0KCdhcmlhLWxhYmVsbGVkYnknKSBhcmlhTGFiZWxsZWRieTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gIEBJbnB1dCgpXHJcbiAgZ2V0IHNpemUoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX3NpemU7IH1cclxuICBzZXQgc2l6ZSh2YWx1ZTogbnVtYmVyKSB7XHJcbiAgICB0aGlzLl9zaXplID0gY29lcmNlTnVtYmVyUHJvcGVydHkodmFsdWUpO1xyXG4gIH1cclxuXHJcbiAgQElucHV0KClcclxuICBnZXQgbWluKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9taW47IH1cclxuICBzZXQgbWluKHZhbHVlOiBudW1iZXIpIHtcclxuICAgIHRoaXMuX21pbiA9IGNvZXJjZU51bWJlclByb3BlcnR5KHZhbHVlLCBERUZBVUxUUy5NSU4pO1xyXG4gIH1cclxuICBASW5wdXQoKVxyXG4gIGdldCBhbmltYXRlKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fYW5pbWF0ZTsgfVxyXG4gIHNldCBhbmltYXRlKHZhbHVlKSB7XHJcbiAgICB0aGlzLl9hbmltYXRlID0gY29lcmNlQm9vbGVhblByb3BlcnR5KHZhbHVlKTtcclxuICB9XHJcblxyXG4gIEBJbnB1dCgpXHJcbiAgZ2V0IG1heCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fbWF4OyB9XHJcbiAgc2V0IG1heCh2YWx1ZTogbnVtYmVyKSB7XHJcbiAgICB0aGlzLl9tYXggPSBjb2VyY2VOdW1iZXJQcm9wZXJ0eSh2YWx1ZSwgREVGQVVMVFMuTUFYKTtcclxuICB9XHJcblxyXG4gIEBJbnB1dCgpIHR5cGU6IE5neEdhdWdlVHlwZSA9IERFRkFVTFRTLlRZUEUgYXMgTmd4R2F1Z2VUeXBlO1xyXG5cclxuICBASW5wdXQoKSBjYXA6IE5neEdhdWdlQ2FwID0gREVGQVVMVFMuQ0FQIGFzIE5neEdhdWdlQ2FwO1xyXG5cclxuICBASW5wdXQoKSB0aGljazogbnVtYmVyID0gREVGQVVMVFMuVEhJQ0s7XHJcblxyXG4gIEBJbnB1dCgpIGxhYmVsOiBzdHJpbmc7XHJcblxyXG4gIEBJbnB1dCgpIGFwcGVuZDogc3RyaW5nO1xyXG5cclxuICBASW5wdXQoKSBwcmVwZW5kOiBzdHJpbmc7XHJcblxyXG4gIEBJbnB1dCgpIHNoYWRvd0NvbG9yOiBzdHJpbmcgPSAnJztcclxuXHJcbiAgQElucHV0KCkgZm9yZWdyb3VuZENvbG9yOiBzdHJpbmcgPSBERUZBVUxUUy5GT1JFR1JPVU5EX0NPTE9SO1xyXG5cclxuICBASW5wdXQoKSBiYWNrZ3JvdW5kQ29sb3I6IHN0cmluZyA9IERFRkFVTFRTLkJBQ0tHUk9VTkRfQ09MT1I7XHJcblxyXG4gIEBJbnB1dCgpIHRocmVzaG9sZHM6IE9iamVjdCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XHJcblxyXG4gIC8vIElmIHNldCB0byB0cnVlLCB0aHJlc2hvbGRzIHdpbGwgcmVtYWluIHRoZWlyIGNvbG9yIGV2ZW4gaWYgdGhlIGdhdWdlIGlzIGluIGFub3RoZXIgdGhyZXNob2xkXHJcbiAgQElucHV0KCkgcHJlc2VydmVUaHJlc2hvbGRzOiBPYmplY3QgPSBmYWxzZTtcclxuXHJcbiAgQElucHV0KCkgdGh1bWI6IE9iamVjdCA9IGZhbHNlO1xyXG5cclxuICBwcml2YXRlIF92YWx1ZTogbnVtYmVyID0gMDtcclxuXHJcbiAgQElucHV0KClcclxuICBnZXQgdmFsdWUoKSB7IHJldHVybiB0aGlzLl92YWx1ZTsgfVxyXG4gIHNldCB2YWx1ZSh2YWw6IG51bWJlcikge1xyXG4gICAgdGhpcy5fdmFsdWUgPSBjb2VyY2VOdW1iZXJQcm9wZXJ0eSh2YWwpO1xyXG4gIH1cclxuXHJcbiAgQElucHV0KCkgZHVyYXRpb246IG51bWJlciA9IDEyMDA7XHJcblxyXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgX2VsZW1lbnRSZWY6IEVsZW1lbnRSZWYsIHByaXZhdGUgX3JlbmRlcmVyOiBSZW5kZXJlcjIpIHsgfVxyXG5cclxuICBuZ09uQ2hhbmdlcyhjaGFuZ2VzOiBTaW1wbGVDaGFuZ2VzKSB7XHJcbiAgICBjb25zdCBpc0NhbnZhc1Byb3BlcnR5Q2hhbmdlZCA9IGNoYW5nZXNbJ3RoaWNrJ10gfHwgY2hhbmdlc1sndHlwZSddIHx8IGNoYW5nZXNbJ2NhcCddIHx8IGNoYW5nZXNbJ3NpemUnXTtcclxuICAgIGNvbnN0IGlzRGF0YUNoYW5nZWQgPSBjaGFuZ2VzWyd2YWx1ZSddIHx8IGNoYW5nZXNbJ21pbiddIHx8IGNoYW5nZXNbJ21heCddO1xyXG5cclxuICAgIGlmICh0aGlzLl9pbml0aWFsaXplZCkge1xyXG4gICAgICBpZiAoaXNEYXRhQ2hhbmdlZCkge1xyXG4gICAgICAgIGxldCBudiwgb3Y7XHJcbiAgICAgICAgaWYgKGNoYW5nZXNbJ3ZhbHVlJ10pIHtcclxuICAgICAgICAgIG52ID0gY2hhbmdlc1sndmFsdWUnXS5jdXJyZW50VmFsdWU7XHJcbiAgICAgICAgICBvdiA9IGNoYW5nZXNbJ3ZhbHVlJ10ucHJldmlvdXNWYWx1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5fdXBkYXRlKG52LCBvdik7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKGlzQ2FudmFzUHJvcGVydHlDaGFuZ2VkKSB7XHJcbiAgICAgICAgdGhpcy5fZGVzdHJveSgpO1xyXG4gICAgICAgIHRoaXMuX2luaXQoKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBfdXBkYXRlU2l6ZSgpIHtcclxuICAgIHRoaXMuX3JlbmRlcmVyLnNldFN0eWxlKHRoaXMuX2VsZW1lbnRSZWYubmF0aXZlRWxlbWVudCwgJ3dpZHRoJywgY3NzVW5pdCh0aGlzLl9nZXRXaWR0aCgpKSk7XHJcbiAgICB0aGlzLl9yZW5kZXJlci5zZXRTdHlsZSh0aGlzLl9lbGVtZW50UmVmLm5hdGl2ZUVsZW1lbnQsICdoZWlnaHQnLCBjc3NVbml0KHRoaXMuX2dldENhbnZhc0hlaWdodCgpKSk7XHJcbiAgICB0aGlzLl9jYW52YXMubmF0aXZlRWxlbWVudC53aWR0aCA9IHRoaXMuX2dldFdpZHRoKCk7XHJcbiAgICB0aGlzLl9jYW52YXMubmF0aXZlRWxlbWVudC5oZWlnaHQgPSB0aGlzLl9nZXRDYW52YXNIZWlnaHQoKTtcclxuICAgIHRoaXMuX3JlbmRlcmVyLnNldFN0eWxlKHRoaXMuX2xhYmVsLm5hdGl2ZUVsZW1lbnQsXHJcbiAgICAgICd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlWSgnICsgKHRoaXMuc2l6ZSAvIDMgKiAyIC0gdGhpcy5zaXplIC8gMTMgLyA0KSArICdweCknKTtcclxuICAgIHRoaXMuX3JlbmRlcmVyLnNldFN0eWxlKHRoaXMuX3JlYWRpbmcubmF0aXZlRWxlbWVudCxcclxuICAgICAgJ3RyYW5zZm9ybScsICd0cmFuc2xhdGVZKCcgKyAodGhpcy5zaXplIC8gMiAtIHRoaXMuc2l6ZSAqIDAuMjIgLyAyKSArICdweCknKTtcclxuICB9XHJcblxyXG4gIG5nQWZ0ZXJWaWV3SW5pdCgpIHtcclxuICAgIGlmICh0aGlzLl9jYW52YXMpIHtcclxuICAgICAgdGhpcy5faW5pdCgpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgbmdPbkRlc3Ryb3koKSB7XHJcbiAgICB0aGlzLl9kZXN0cm95KCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIF9nZXRCb3VuZHModHlwZTogTmd4R2F1Z2VUeXBlKSB7XHJcbiAgICBsZXQgaGVhZCwgdGFpbDtcclxuICAgIGlmICh0eXBlID09ICdzZW1pJykge1xyXG4gICAgICBoZWFkID0gTWF0aC5QSTtcclxuICAgICAgdGFpbCA9IDIgKiBNYXRoLlBJO1xyXG4gICAgfSBlbHNlIGlmICh0eXBlID09ICdmdWxsJykge1xyXG4gICAgICBoZWFkID0gMS41ICogTWF0aC5QSTtcclxuICAgICAgdGFpbCA9IDMuNSAqIE1hdGguUEk7XHJcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdhcmNoJykge1xyXG4gICAgICBoZWFkID0gMC44ICogTWF0aC5QSTtcclxuICAgICAgdGFpbCA9IDIuMiAqIE1hdGguUEk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4geyBoZWFkLCB0YWlsIH07XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIF9kcmF3U2hlbGwoc3RhcnQ6IG51bWJlciwgbWlkZGxlOiBudW1iZXIsIHRhaWw6IG51bWJlciwgY29sb3I6IHN0cmluZykge1xyXG4gICAgaWYgKHRoaXMucHJlc2VydmVUaHJlc2hvbGRzKSB7XHJcbiAgICAgIHRoaXMuX2RyYXdTaGVsbFdpdGhTZWdtZW50cyhzdGFydCwgbWlkZGxlLCB0YWlsKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCBjZW50ZXIgPSB0aGlzLl9nZXRDZW50ZXIoKSxcclxuICAgICAgcmFkaXVzID0gdGhpcy5fZ2V0UmFkaXVzKCk7XHJcblxyXG4gICAgbWlkZGxlID0gTWF0aC5tYXgobWlkZGxlLCBzdGFydCk7IC8vIG5ldmVyIGJlbG93IDAlXHJcbiAgICBtaWRkbGUgPSBNYXRoLm1pbihtaWRkbGUsIHRhaWwpOyAvLyBuZXZlciBleGNlZWQgMTAwJVxyXG4gICAgaWYgKHRoaXMuX2luaXRpYWxpemVkKSB7XHJcbiAgICAgIHRoaXMuX2NsZWFyKCk7XHJcbiAgICAgIHRoaXMuX2NvbnRleHQuYmVnaW5QYXRoKCk7XHJcbiAgICAgIHRoaXMuX2NvbnRleHQuc3Ryb2tlU3R5bGUgPSB0aGlzLmJhY2tncm91bmRDb2xvcjtcclxuICAgICAgdGhpcy5fY29udGV4dC5hcmMoY2VudGVyLngsIGNlbnRlci55LCByYWRpdXMsIG1pZGRsZSwgdGFpbCwgZmFsc2UpO1xyXG4gICAgICB0aGlzLl9jb250ZXh0LnN0cm9rZSgpO1xyXG5cclxuICAgICAgdGhpcy5fY29udGV4dC5iZWdpblBhdGgoKTtcclxuICAgICAgdGhpcy5fY29udGV4dC5zdHJva2VTdHlsZSA9IGNvbG9yO1xyXG4gICAgICB0aGlzLl9jb250ZXh0LmFyYyhjZW50ZXIueCwgY2VudGVyLnksIHJhZGl1cywgc3RhcnQsIG1pZGRsZSwgZmFsc2UpO1xyXG4gICAgICB0aGlzLl9jb250ZXh0LnN0cm9rZSgpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBfZHJhd1NoZWxsV2l0aFNlZ21lbnRzKHN0YXJ0OiBudW1iZXIsIGN1cnJlbnRWYWx1ZTogbnVtYmVyLCB0YWlsOiBudW1iZXIpIHtcclxuICAgIGlmICh0aGlzLnRocmVzaG9sZHMgJiYgdGhpcy5faW5pdGlhbGl6ZWQpIHtcclxuICAgICAgbGV0IHBlcmNlbnRhZ2VzID0gT2JqZWN0LmtleXModGhpcy50aHJlc2hvbGRzKSxcclxuICAgICAgICBhcmNMZW5ndGggPSB0YWlsIC0gc3RhcnQsXHJcbiAgICAgICAgdmFsdWVQZXJjZW50ID0gKGN1cnJlbnRWYWx1ZSAtIHN0YXJ0KSAvIGFyY0xlbmd0aDtcclxuXHJcbiAgICAgIHRoaXMuX2NsZWFyKCk7XHJcbiAgICAgIGxldCB0aHVtYkNvbG9yID0gdGhpcy5iYWNrZ3JvdW5kQ29sb3I7XHJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGVyY2VudGFnZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBsZXQgc3RhcnRQZXJjZW50YWdlID0gKE51bWJlcihwZXJjZW50YWdlc1tpXSkgLyAxMDApLFxyXG4gICAgICAgICAgbmV4dFBlcmNlbnRhZ2UgPSAoTnVtYmVyKHBlcmNlbnRhZ2VzW2kgKyAxXSkgLyAxMDApIHx8IDEsXHJcbiAgICAgICAgICBwZXJjZW50YWdlVG9UcmF2ZWwgPSAobmV4dFBlcmNlbnRhZ2UgLSBzdGFydFBlcmNlbnRhZ2UpLFxyXG4gICAgICAgICAgY29sb3IgPSB0aGlzLnRocmVzaG9sZHNbcGVyY2VudGFnZXNbaV1dLmNvbG9yLFxyXG4gICAgICAgICAgZmFsbGJhY2tDb2xvciA9IHRoaXMudGhyZXNob2xkc1twZXJjZW50YWdlc1tpXV0uZmFsbGJhY2tDb2xvciB8fCB0aGlzLmJhY2tncm91bmRDb2xvcjtcclxuXHJcbiAgICAgICAgaWYgKHZhbHVlUGVyY2VudCA+PSBzdGFydFBlcmNlbnRhZ2UgJiYgdmFsdWVQZXJjZW50IDw9IG5leHRQZXJjZW50YWdlKSB7XHJcbiAgICAgICAgICBsZXQgcGVyY2VudGFnZU9mQ3VycmVudEFyYyA9ICh2YWx1ZVBlcmNlbnQgLSBzdGFydFBlcmNlbnRhZ2UpIC8gcGVyY2VudGFnZVRvVHJhdmVsO1xyXG4gICAgICAgICAgbGV0IGFjdGl2ZUFyY0VuZCA9IHN0YXJ0ICsgKGFyY0xlbmd0aCAqIHBlcmNlbnRhZ2VUb1RyYXZlbCAqIHBlcmNlbnRhZ2VPZkN1cnJlbnRBcmMpO1xyXG4gICAgICAgICAgdGh1bWJDb2xvciA9IGNvbG9yXHJcbiAgICAgICAgICB0aGlzLl9kcmF3QXJjKHN0YXJ0LCBhY3RpdmVBcmNFbmQsIGNvbG9yKTtcclxuICAgICAgICAgIGlmICh0aGlzLnNoYWRvd0NvbG9yKSB7XHJcbiAgICAgICAgICAgIHRoaXMuX2RyYXdBcmNTaGFkb3coc3RhcnQsIGFjdGl2ZUFyY0VuZCwgdGhpcy5zaGFkb3dDb2xvcik7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgbGV0IGluYWN0aXZlQXJjRW5kID0gYWN0aXZlQXJjRW5kICsgKGFyY0xlbmd0aCAqIHBlcmNlbnRhZ2VUb1RyYXZlbCAqICgxIC0gcGVyY2VudGFnZU9mQ3VycmVudEFyYykpO1xyXG4gICAgICAgICAgdGhpcy5fZHJhd0FyYyhhY3RpdmVBcmNFbmQsIGluYWN0aXZlQXJjRW5kLCBmYWxsYmFja0NvbG9yKTtcclxuICAgICAgICAgIGlmICh0aGlzLnNoYWRvd0NvbG9yKSB7XHJcbiAgICAgICAgICAgIHRoaXMuX2RyYXdBcmNTaGFkb3coYWN0aXZlQXJjRW5kLCBpbmFjdGl2ZUFyY0VuZCwgdGhpcy5zaGFkb3dDb2xvcik7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgc3RhcnQgPSBpbmFjdGl2ZUFyY0VuZDtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgbGV0IGFyY0NvbG9yID0gKHN0YXJ0UGVyY2VudGFnZSA+PSB2YWx1ZVBlcmNlbnQpID8gZmFsbGJhY2tDb2xvciA6IGNvbG9yO1xyXG4gICAgICAgICAgbGV0IGVuZCA9IHN0YXJ0ICsgKGFyY0xlbmd0aCAqIHBlcmNlbnRhZ2VUb1RyYXZlbCk7XHJcbiAgICAgICAgICB0aGlzLl9kcmF3QXJjKHN0YXJ0LCBlbmQsIGFyY0NvbG9yKTtcclxuICAgICAgICAgIGlmICh0aGlzLnNoYWRvd0NvbG9yKSB7XHJcbiAgICAgICAgICAgIHRoaXMuX2RyYXdBcmNTaGFkb3coc3RhcnQsIGVuZCwgdGhpcy5zaGFkb3dDb2xvcik7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgc3RhcnQgPSBlbmQ7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAodGhpcy50aHVtYikge1xyXG4gICAgICAgIHRoaXMuX2RyYXdUaHVtYihjdXJyZW50VmFsdWUsIHRodW1iQ29sb3IpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIF9kcmF3QXJjKHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyLCBjb2xvcjogc3RyaW5nKSB7XHJcbiAgICBsZXQgY2VudGVyID0gdGhpcy5fZ2V0Q2VudGVyKCk7XHJcbiAgICBsZXQgcmFkaXVzID0gdGhpcy5fZ2V0UmFkaXVzKCk7XHJcbiAgICB0aGlzLl9jb250ZXh0LmJlZ2luUGF0aCgpO1xyXG4gICAgdGhpcy5fY29udGV4dC5zdHJva2VTdHlsZSA9IGNvbG9yO1xyXG4gICAgdGhpcy5fY29udGV4dC5hcmMoY2VudGVyLngsIGNlbnRlci55LCByYWRpdXMsIHN0YXJ0LCBlbmQsIGZhbHNlKTtcclxuICAgIHRoaXMuX2NvbnRleHQuc3Ryb2tlKCk7XHJcbiAgfVxyXG4gIHByaXZhdGUgX2RyYXdBcmNTaGFkb3coc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIsIGNvbG9yOiBzdHJpbmcpIHtcclxuICAgIGxldCBjZW50ZXIgPSB0aGlzLl9nZXRDZW50ZXIoKTtcclxuICAgIGxldCByYWRpdXMgPSB0aGlzLl9nZXRSYWRpdXMoKSAqIDAuODk7XHJcbiAgICB0aGlzLl9jb250ZXh0LmJlZ2luUGF0aCgpO1xyXG4gICAgdGhpcy5fY29udGV4dC5zdHJva2VTdHlsZSA9IGNvbG9yO1xyXG4gICAgdGhpcy5fY29udGV4dC5hcmMoY2VudGVyLngsIGNlbnRlci55LCByYWRpdXMsIHN0YXJ0LCBlbmQsIGZhbHNlKTtcclxuICAgIHRoaXMuX2NvbnRleHQuc3Ryb2tlKCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIF9kcmF3VGh1bWIodmFsdWVQZXJjZW50LCBjb2xvcjogc3RyaW5nKSB7XHJcbiAgICBsZXQgcmFkaXVzID0gdGhpcy50aGljayAqIDAuODtcclxuXHJcbiAgICBsZXQgeCA9ICh0aGlzLl9nZXRSYWRpdXMoKSAqIE1hdGguY29zKHZhbHVlUGVyY2VudCkpICsgKHRoaXMuX2dldFdpZHRoKCkgLyAyKVxyXG4gICAgbGV0IHkgPSAodGhpcy5fZ2V0UmFkaXVzKCkgKiBNYXRoLnNpbih2YWx1ZVBlcmNlbnQpKSArICh0aGlzLl9nZXRIZWlnaHQoKSAvIDIpXHJcblxyXG4gICAgdGhpcy5fY29udGV4dC5iZWdpblBhdGgoKTtcclxuICAgIHRoaXMuX2NvbnRleHQuYXJjKHgsIHksIHJhZGl1cywgMCwgMiAqIE1hdGguUEksIGZhbHNlKTtcclxuICAgIHRoaXMuX2NvbnRleHQuZmlsbFN0eWxlID0gXCIjZmZmXCI7XHJcbiAgICB0aGlzLl9jb250ZXh0LmZpbGwoKTtcclxuICAgIHRoaXMuX2NvbnRleHQubGluZVdpZHRoID0gdGhpcy50aGljayAvIDM7XHJcbiAgICB0aGlzLl9jb250ZXh0LnN0cm9rZVN0eWxlID0gY29sb3I7XHJcbiAgICB0aGlzLl9jb250ZXh0LnN0cm9rZSgpO1xyXG4gICAgdGhpcy5fY29udGV4dC5saW5lV2lkdGggPSB0aGlzLnRoaWNrXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIF9jbGVhcigpIHtcclxuICAgIHRoaXMuX2NvbnRleHQuY2xlYXJSZWN0KDAsIDAsIHRoaXMuX2dldFdpZHRoKCksIHRoaXMuX2dldEhlaWdodCgpKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgX2dldFdpZHRoKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuc2l6ZTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgX2dldEhlaWdodCgpIHtcclxuICAgIHJldHVybiB0aGlzLnNpemU7XHJcbiAgfVxyXG5cclxuICAvLyBjYW52YXMgaGVpZ2h0IHdpbGwgYmUgc2hvcnRlciBmb3IgdHlwZSAnc2VtaScgYW5kICdhcmNoJ1xyXG4gIHByaXZhdGUgX2dldENhbnZhc0hlaWdodCgpIHtcclxuICAgIHJldHVybiAodGhpcy50eXBlID09ICdhcmNoJyB8fCB0aGlzLnR5cGUgPT0gJ3NlbWknKVxyXG4gICAgICA/IDAuODUgKiB0aGlzLl9nZXRIZWlnaHQoKVxyXG4gICAgICA6IHRoaXMuX2dldEhlaWdodCgpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBfZ2V0UmFkaXVzKCkge1xyXG4gICAgdmFyIGNlbnRlciA9IHRoaXMuX2dldENlbnRlcigpO1xyXG4gICAgcmV0dXJuIGNlbnRlci54IC0gdGhpcy50aGljaztcclxuICB9XHJcblxyXG4gIHByaXZhdGUgX2dldENlbnRlcigpIHtcclxuICAgIHZhciB4ID0gdGhpcy5fZ2V0V2lkdGgoKSAvIDIsXHJcbiAgICAgIHkgPSB0aGlzLl9nZXRIZWlnaHQoKSAvIDI7XHJcbiAgICByZXR1cm4geyB4LCB5IH07XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIF9pbml0KCkge1xyXG4gICAgdGhpcy5fY29udGV4dCA9ICh0aGlzLl9jYW52YXMubmF0aXZlRWxlbWVudCBhcyBIVE1MQ2FudmFzRWxlbWVudCkuZ2V0Q29udGV4dCgnMmQnKTtcclxuICAgIHRoaXMuX2luaXRpYWxpemVkID0gdHJ1ZTtcclxuICAgIHRoaXMuX3VwZGF0ZVNpemUoKTtcclxuICAgIHRoaXMuX3NldHVwU3R5bGVzKCk7XHJcbiAgICB0aGlzLl9jcmVhdGUoKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgX2Rlc3Ryb3koKSB7XHJcbiAgICBpZiAodGhpcy5fYW5pbWF0aW9uUmVxdWVzdElEKSB7XHJcbiAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLl9hbmltYXRpb25SZXF1ZXN0SUQpO1xyXG4gICAgICB0aGlzLl9hbmltYXRpb25SZXF1ZXN0SUQgPSAwO1xyXG4gICAgfVxyXG4gICAgdGhpcy5fY2xlYXIoKTtcclxuICAgIHRoaXMuX2NvbnRleHQgPSBudWxsO1xyXG4gICAgdGhpcy5faW5pdGlhbGl6ZWQgPSBmYWxzZTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgX3NldHVwU3R5bGVzKCkge1xyXG4gICAgdGhpcy5fY29udGV4dC5saW5lQ2FwID0gdGhpcy5jYXA7XHJcbiAgICB0aGlzLl9jb250ZXh0LmxpbmVXaWR0aCA9IHRoaXMudGhpY2s7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIF9nZXRGb3JlZ3JvdW5kQ29sb3JCeVJhbmdlKHZhbHVlKSB7XHJcblxyXG4gICAgY29uc3QgbWF0Y2ggPSBPYmplY3Qua2V5cyh0aGlzLnRocmVzaG9sZHMpXHJcbiAgICAgIC5maWx0ZXIoZnVuY3Rpb24gKGl0ZW0pIHsgcmV0dXJuIGlzTnVtYmVyKGl0ZW0pICYmIE51bWJlcihpdGVtKSA8PSB2YWx1ZSB9KVxyXG4gICAgICAuc29ydCgoYSwgYikgPT4gTnVtYmVyKGEpIC0gTnVtYmVyKGIpKVxyXG4gICAgICAucmV2ZXJzZSgpWzBdO1xyXG5cclxuICAgIHJldHVybiBtYXRjaCAhPT0gdW5kZWZpbmVkXHJcbiAgICAgID8gdGhpcy50aHJlc2hvbGRzW21hdGNoXS5jb2xvciB8fCB0aGlzLmZvcmVncm91bmRDb2xvclxyXG4gICAgICA6IHRoaXMuZm9yZWdyb3VuZENvbG9yO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBfY3JlYXRlKG52PzogbnVtYmVyLCBvdj86IG51bWJlcikge1xyXG4gICAgbGV0IHNlbGYgPSB0aGlzLFxyXG4gICAgICB0eXBlID0gdGhpcy50eXBlLFxyXG4gICAgICBib3VuZHMgPSB0aGlzLl9nZXRCb3VuZHModHlwZSksXHJcbiAgICAgIGR1cmF0aW9uID0gdGhpcy5kdXJhdGlvbixcclxuICAgICAgbWluID0gdGhpcy5taW4sXHJcbiAgICAgIG1heCA9IHRoaXMubWF4LFxyXG4gICAgICB2YWx1ZSA9IGNsYW1wKHRoaXMudmFsdWUsIHRoaXMubWluLCB0aGlzLm1heCksXHJcbiAgICAgIHN0YXJ0ID0gYm91bmRzLmhlYWQsXHJcbiAgICAgIHVuaXQgPSAoYm91bmRzLnRhaWwgLSBib3VuZHMuaGVhZCkgLyAobWF4IC0gbWluKSxcclxuICAgICAgZGlzcGxhY2VtZW50ID0gdW5pdCAqICh2YWx1ZSAtIG1pbiksXHJcbiAgICAgIHRhaWwgPSBib3VuZHMudGFpbCxcclxuICAgICAgY29sb3IgPSB0aGlzLl9nZXRGb3JlZ3JvdW5kQ29sb3JCeVJhbmdlKHZhbHVlKSxcclxuICAgICAgc3RhcnRUaW1lO1xyXG5cclxuICAgIGlmIChzZWxmLl9hbmltYXRpb25SZXF1ZXN0SUQpIHtcclxuICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKHNlbGYuX2FuaW1hdGlvblJlcXVlc3RJRCk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gYW5pbWF0ZSh0aW1lc3RhbXApIHtcclxuICAgICAgdGltZXN0YW1wID0gdGltZXN0YW1wIHx8IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xyXG4gICAgICBsZXQgcnVudGltZSA9IHRpbWVzdGFtcCAtIHN0YXJ0VGltZTtcclxuICAgICAgbGV0IHByb2dyZXNzID0gTWF0aC5taW4ocnVudGltZSAvIGR1cmF0aW9uLCAxKTtcclxuICAgICAgbGV0IHByZXZpb3VzUHJvZ3Jlc3MgPSBvdiA/IChvdiAtIG1pbikgKiB1bml0IDogMDtcclxuICAgICAgbGV0IG1pZGRsZSA9IHN0YXJ0ICsgcHJldmlvdXNQcm9ncmVzcyArIGRpc3BsYWNlbWVudCAqIHByb2dyZXNzO1xyXG5cclxuICAgICAgc2VsZi5fZHJhd1NoZWxsKHN0YXJ0LCBtaWRkbGUsIHRhaWwsIGNvbG9yKTtcclxuICAgICAgaWYgKHNlbGYuX2FuaW1hdGlvblJlcXVlc3RJRCAmJiAocnVudGltZSA8IGR1cmF0aW9uKSkge1xyXG4gICAgICAgIHNlbGYuX2FuaW1hdGlvblJlcXVlc3RJRCA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKHRpbWVzdGFtcCkgPT4gYW5pbWF0ZSh0aW1lc3RhbXApKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUoc2VsZi5fYW5pbWF0aW9uUmVxdWVzdElEKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMuX2FuaW1hdGUpIHtcclxuICAgICAgaWYgKG52ICE9IHVuZGVmaW5lZCAmJiBvdiAhPSB1bmRlZmluZWQpIHtcclxuICAgICAgICBkaXNwbGFjZW1lbnQgPSB1bml0ICogbnYgLSB1bml0ICogb3Y7XHJcbiAgICAgIH1cclxuICAgICAgc2VsZi5fYW5pbWF0aW9uUmVxdWVzdElEID0gd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgodGltZXN0YW1wKSA9PiB7XHJcbiAgICAgICAgc3RhcnRUaW1lID0gdGltZXN0YW1wIHx8IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xyXG4gICAgICAgIGFuaW1hdGUoc3RhcnRUaW1lKTtcclxuICAgICAgfSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBzZWxmLl9kcmF3U2hlbGwoc3RhcnQsIHN0YXJ0ICsgZGlzcGxhY2VtZW50LCB0YWlsLCBjb2xvcik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIF91cGRhdGUobnY6IG51bWJlciwgb3Y6IG51bWJlcikge1xyXG4gICAgdGhpcy5fY2xlYXIoKTtcclxuICAgIHRoaXMuX2NyZWF0ZShudiwgb3YpO1xyXG4gIH1cclxuXHJcbn1cclxuIl19
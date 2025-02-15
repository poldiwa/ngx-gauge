import { Directive, Component, ViewEncapsulation, ElementRef, Renderer2, ViewChild, ContentChild, Input, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function coerceBooleanProperty(value) {
    return value != null && `${value}` !== 'false';
}
function coerceNumberProperty(value, fallbackValue = 0) {
    return isNaN(parseFloat(value)) || isNaN(Number(value)) ? fallbackValue : Number(value);
}
function cssUnit(value) {
    return `${value}px`;
}
function isNumber(value) {
    return value != undefined && !isNaN(parseFloat(value)) && !isNaN(Number(value));
}

class NgxGaugeAppend {
}
NgxGaugeAppend.decorators = [
    { type: Directive, args: [{
                selector: "ngx-gauge-append",
                exportAs: "ngxGaugeAppend"
            },] }
];
class NgxGaugePrepend {
}
NgxGaugePrepend.decorators = [
    { type: Directive, args: [{
                selector: "ngx-gauge-prepend",
                exportAs: "ngxGaugePrepend"
            },] }
];
class NgxGaugeValue {
}
NgxGaugeValue.decorators = [
    { type: Directive, args: [{
                selector: "ngx-gauge-value",
                exportAs: "ngxGaugeValue"
            },] }
];
class NgxGaugeLabel {
}
NgxGaugeLabel.decorators = [
    { type: Directive, args: [{
                selector: "ngx-gauge-label",
                exportAs: "ngxGaugeLabel"
            },] }
];

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
class NgxGauge {
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

class NgxGaugeModule {
}
NgxGaugeModule.decorators = [
    { type: NgModule, args: [{
                imports: [CommonModule],
                declarations: [NgxGauge, NgxGaugeAppend, NgxGaugePrepend, NgxGaugeValue, NgxGaugeLabel],
                exports: [NgxGauge, NgxGaugeAppend, NgxGaugePrepend, NgxGaugeValue, NgxGaugeLabel]
            },] }
];

/*
 * Public APIs of ngx-gauge
 */

/**
 * Generated bundle index. Do not edit.
 */

export { NgxGaugeModule, NgxGauge as ɵa, NgxGaugeAppend as ɵb, NgxGaugePrepend as ɵc, NgxGaugeValue as ɵd, NgxGaugeLabel as ɵe };
//# sourceMappingURL=ngx-gauge.js.map

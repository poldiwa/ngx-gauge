(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@angular/core'), require('@angular/common')) :
    typeof define === 'function' && define.amd ? define('ngx-gauge', ['exports', '@angular/core', '@angular/common'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global['ngx-gauge'] = {}, global.ng.core, global.ng.common));
}(this, (function (exports, core, common) { 'use strict';

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    function coerceBooleanProperty(value) {
        return value != null && "" + value !== 'false';
    }
    function coerceNumberProperty(value, fallbackValue) {
        if (fallbackValue === void 0) { fallbackValue = 0; }
        return isNaN(parseFloat(value)) || isNaN(Number(value)) ? fallbackValue : Number(value);
    }
    function cssUnit(value) {
        return value + "px";
    }
    function isNumber(value) {
        return value != undefined && !isNaN(parseFloat(value)) && !isNaN(Number(value));
    }

    var NgxGaugeAppend = /** @class */ (function () {
        function NgxGaugeAppend() {
        }
        return NgxGaugeAppend;
    }());
    NgxGaugeAppend.decorators = [
        { type: core.Directive, args: [{
                    selector: "ngx-gauge-append",
                    exportAs: "ngxGaugeAppend"
                },] }
    ];
    var NgxGaugePrepend = /** @class */ (function () {
        function NgxGaugePrepend() {
        }
        return NgxGaugePrepend;
    }());
    NgxGaugePrepend.decorators = [
        { type: core.Directive, args: [{
                    selector: "ngx-gauge-prepend",
                    exportAs: "ngxGaugePrepend"
                },] }
    ];
    var NgxGaugeValue = /** @class */ (function () {
        function NgxGaugeValue() {
        }
        return NgxGaugeValue;
    }());
    NgxGaugeValue.decorators = [
        { type: core.Directive, args: [{
                    selector: "ngx-gauge-value",
                    exportAs: "ngxGaugeValue"
                },] }
    ];
    var NgxGaugeLabel = /** @class */ (function () {
        function NgxGaugeLabel() {
        }
        return NgxGaugeLabel;
    }());
    NgxGaugeLabel.decorators = [
        { type: core.Directive, args: [{
                    selector: "ngx-gauge-label",
                    exportAs: "ngxGaugeLabel"
                },] }
    ];

    var DEFAULTS = {
        MIN: 0,
        MAX: 100,
        TYPE: 'arch',
        THICK: 4,
        FOREGROUND_COLOR: 'rgba(0, 150, 136, 1)',
        BACKGROUND_COLOR: 'rgba(0, 0, 0, 0.1)',
        CAP: 'butt',
        SIZE: 200
    };
    var NgxGauge = /** @class */ (function () {
        function NgxGauge(_elementRef, _renderer) {
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
        Object.defineProperty(NgxGauge.prototype, "size", {
            get: function () { return this._size; },
            set: function (value) {
                this._size = coerceNumberProperty(value);
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(NgxGauge.prototype, "min", {
            get: function () { return this._min; },
            set: function (value) {
                this._min = coerceNumberProperty(value, DEFAULTS.MIN);
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(NgxGauge.prototype, "animate", {
            get: function () { return this._animate; },
            set: function (value) {
                this._animate = coerceBooleanProperty(value);
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(NgxGauge.prototype, "max", {
            get: function () { return this._max; },
            set: function (value) {
                this._max = coerceNumberProperty(value, DEFAULTS.MAX);
            },
            enumerable: false,
            configurable: true
        });
        Object.defineProperty(NgxGauge.prototype, "value", {
            get: function () { return this._value; },
            set: function (val) {
                this._value = coerceNumberProperty(val);
            },
            enumerable: false,
            configurable: true
        });
        NgxGauge.prototype.ngOnChanges = function (changes) {
            var isCanvasPropertyChanged = changes['thick'] || changes['type'] || changes['cap'] || changes['size'];
            var isDataChanged = changes['value'] || changes['min'] || changes['max'];
            if (this._initialized) {
                if (isDataChanged) {
                    var nv = void 0, ov = void 0;
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
        };
        NgxGauge.prototype._updateSize = function () {
            this._renderer.setStyle(this._elementRef.nativeElement, 'width', cssUnit(this._getWidth()));
            this._renderer.setStyle(this._elementRef.nativeElement, 'height', cssUnit(this._getCanvasHeight()));
            this._canvas.nativeElement.width = this._getWidth();
            this._canvas.nativeElement.height = this._getCanvasHeight();
            this._renderer.setStyle(this._label.nativeElement, 'transform', 'translateY(' + (this.size / 3 * 2 - this.size / 13 / 4) + 'px)');
            this._renderer.setStyle(this._reading.nativeElement, 'transform', 'translateY(' + (this.size / 2 - this.size * 0.22 / 2) + 'px)');
        };
        NgxGauge.prototype.ngAfterViewInit = function () {
            if (this._canvas) {
                this._init();
            }
        };
        NgxGauge.prototype.ngOnDestroy = function () {
            this._destroy();
        };
        NgxGauge.prototype._getBounds = function (type) {
            var head, tail;
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
            return { head: head, tail: tail };
        };
        NgxGauge.prototype._drawShell = function (start, middle, tail, color) {
            if (this.preserveThresholds) {
                this._drawShellWithSegments(start, middle, tail);
                return;
            }
            var center = this._getCenter(), radius = this._getRadius();
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
        };
        NgxGauge.prototype._drawShellWithSegments = function (start, currentValue, tail) {
            if (this.thresholds && this._initialized) {
                var percentages = Object.keys(this.thresholds), arcLength = tail - start, valuePercent = (currentValue - start) / arcLength;
                this._clear();
                var thumbColor = this.backgroundColor;
                for (var i = 0; i < percentages.length; i++) {
                    var startPercentage = (Number(percentages[i]) / 100), nextPercentage = (Number(percentages[i + 1]) / 100) || 1, percentageToTravel = (nextPercentage - startPercentage), color = this.thresholds[percentages[i]].color, fallbackColor = this.thresholds[percentages[i]].fallbackColor || this.backgroundColor;
                    if (valuePercent >= startPercentage && valuePercent <= nextPercentage) {
                        var percentageOfCurrentArc = (valuePercent - startPercentage) / percentageToTravel;
                        var activeArcEnd = start + (arcLength * percentageToTravel * percentageOfCurrentArc);
                        thumbColor = color;
                        this._drawArc(start, activeArcEnd, color);
                        if (this.shadowColor) {
                            this._drawArcShadow(start, activeArcEnd, this.shadowColor);
                        }
                        var inactiveArcEnd = activeArcEnd + (arcLength * percentageToTravel * (1 - percentageOfCurrentArc));
                        this._drawArc(activeArcEnd, inactiveArcEnd, fallbackColor);
                        if (this.shadowColor) {
                            this._drawArcShadow(activeArcEnd, inactiveArcEnd, this.shadowColor);
                        }
                        start = inactiveArcEnd;
                    }
                    else {
                        var arcColor = (startPercentage >= valuePercent) ? fallbackColor : color;
                        var end = start + (arcLength * percentageToTravel);
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
        };
        NgxGauge.prototype._drawArc = function (start, end, color) {
            var center = this._getCenter();
            var radius = this._getRadius();
            this._context.beginPath();
            this._context.strokeStyle = color;
            this._context.arc(center.x, center.y, radius, start, end, false);
            this._context.stroke();
        };
        NgxGauge.prototype._drawArcShadow = function (start, end, color) {
            var center = this._getCenter();
            var radius = this._getRadius() * 0.89;
            this._context.beginPath();
            this._context.strokeStyle = color;
            this._context.arc(center.x, center.y, radius, start, end, false);
            this._context.stroke();
        };
        NgxGauge.prototype._drawThumb = function (valuePercent, color) {
            var radius = this.thick * 0.8;
            var x = (this._getRadius() * Math.cos(valuePercent)) + (this._getWidth() / 2);
            var y = (this._getRadius() * Math.sin(valuePercent)) + (this._getHeight() / 2);
            this._context.beginPath();
            this._context.arc(x, y, radius, 0, 2 * Math.PI, false);
            this._context.fillStyle = "#fff";
            this._context.fill();
            this._context.lineWidth = this.thick / 3;
            this._context.strokeStyle = color;
            this._context.stroke();
            this._context.lineWidth = this.thick;
        };
        NgxGauge.prototype._clear = function () {
            this._context.clearRect(0, 0, this._getWidth(), this._getHeight());
        };
        NgxGauge.prototype._getWidth = function () {
            return this.size;
        };
        NgxGauge.prototype._getHeight = function () {
            return this.size;
        };
        // canvas height will be shorter for type 'semi' and 'arch'
        NgxGauge.prototype._getCanvasHeight = function () {
            return (this.type == 'arch' || this.type == 'semi')
                ? 0.85 * this._getHeight()
                : this._getHeight();
        };
        NgxGauge.prototype._getRadius = function () {
            var center = this._getCenter();
            return center.x - this.thick;
        };
        NgxGauge.prototype._getCenter = function () {
            var x = this._getWidth() / 2, y = this._getHeight() / 2;
            return { x: x, y: y };
        };
        NgxGauge.prototype._init = function () {
            this._context = this._canvas.nativeElement.getContext('2d');
            this._initialized = true;
            this._updateSize();
            this._setupStyles();
            this._create();
        };
        NgxGauge.prototype._destroy = function () {
            if (this._animationRequestID) {
                window.cancelAnimationFrame(this._animationRequestID);
                this._animationRequestID = 0;
            }
            this._clear();
            this._context = null;
            this._initialized = false;
        };
        NgxGauge.prototype._setupStyles = function () {
            this._context.lineCap = this.cap;
            this._context.lineWidth = this.thick;
        };
        NgxGauge.prototype._getForegroundColorByRange = function (value) {
            var match = Object.keys(this.thresholds)
                .filter(function (item) { return isNumber(item) && Number(item) <= value; })
                .sort(function (a, b) { return Number(a) - Number(b); })
                .reverse()[0];
            return match !== undefined
                ? this.thresholds[match].color || this.foregroundColor
                : this.foregroundColor;
        };
        NgxGauge.prototype._create = function (nv, ov) {
            var self = this, type = this.type, bounds = this._getBounds(type), duration = this.duration, min = this.min, max = this.max, value = clamp(this.value, this.min, this.max), start = bounds.head, unit = (bounds.tail - bounds.head) / (max - min), displacement = unit * (value - min), tail = bounds.tail, color = this._getForegroundColorByRange(value), startTime;
            if (self._animationRequestID) {
                window.cancelAnimationFrame(self._animationRequestID);
            }
            function animate(timestamp) {
                timestamp = timestamp || new Date().getTime();
                var runtime = timestamp - startTime;
                var progress = Math.min(runtime / duration, 1);
                var previousProgress = ov ? (ov - min) * unit : 0;
                var middle = start + previousProgress + displacement * progress;
                self._drawShell(start, middle, tail, color);
                if (self._animationRequestID && (runtime < duration)) {
                    self._animationRequestID = window.requestAnimationFrame(function (timestamp) { return animate(timestamp); });
                }
                else {
                    window.cancelAnimationFrame(self._animationRequestID);
                }
            }
            if (this._animate) {
                if (nv != undefined && ov != undefined) {
                    displacement = unit * nv - unit * ov;
                }
                self._animationRequestID = window.requestAnimationFrame(function (timestamp) {
                    startTime = timestamp || new Date().getTime();
                    animate(startTime);
                });
            }
            else {
                self._drawShell(start, start + displacement, tail, color);
            }
        };
        NgxGauge.prototype._update = function (nv, ov) {
            this._clear();
            this._create(nv, ov);
        };
        return NgxGauge;
    }());
    NgxGauge.decorators = [
        { type: core.Component, args: [{
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
                    encapsulation: core.ViewEncapsulation.None,
                    styles: [".ngx-gauge-meter{display:inline-block;text-align:center;position:relative}.reading-block,.reading-label{position:absolute;width:100%;font-weight:400;white-space:nowrap;text-align:center;overflow:hidden;text-overflow:ellipsis}.reading-label{font-family:inherit;display:inline-block}.reading-affix{text-decoration:none;font-size:.6em;opacity:.8;font-weight:200;padding:0 .18em}.reading-affix:first-child{padding-left:0}.reading-affix:last-child{padding-right:0}"]
                },] }
    ];
    NgxGauge.ctorParameters = function () { return [
        { type: core.ElementRef },
        { type: core.Renderer2 }
    ]; };
    NgxGauge.propDecorators = {
        _canvas: [{ type: core.ViewChild, args: ['canvas', { static: true },] }],
        _label: [{ type: core.ViewChild, args: ['rLabel', { static: true },] }],
        _reading: [{ type: core.ViewChild, args: ['reading', { static: true },] }],
        _labelChild: [{ type: core.ContentChild, args: [NgxGaugeLabel,] }],
        _prependChild: [{ type: core.ContentChild, args: [NgxGaugePrepend,] }],
        _appendChild: [{ type: core.ContentChild, args: [NgxGaugeAppend,] }],
        _valueDisplayChild: [{ type: core.ContentChild, args: [NgxGaugeValue,] }],
        ariaLabel: [{ type: core.Input, args: ['aria-label',] }],
        ariaLabelledby: [{ type: core.Input, args: ['aria-labelledby',] }],
        size: [{ type: core.Input }],
        min: [{ type: core.Input }],
        animate: [{ type: core.Input }],
        max: [{ type: core.Input }],
        type: [{ type: core.Input }],
        cap: [{ type: core.Input }],
        thick: [{ type: core.Input }],
        label: [{ type: core.Input }],
        append: [{ type: core.Input }],
        prepend: [{ type: core.Input }],
        shadowColor: [{ type: core.Input }],
        foregroundColor: [{ type: core.Input }],
        backgroundColor: [{ type: core.Input }],
        thresholds: [{ type: core.Input }],
        preserveThresholds: [{ type: core.Input }],
        thumb: [{ type: core.Input }],
        value: [{ type: core.Input }],
        duration: [{ type: core.Input }]
    };

    var NgxGaugeModule = /** @class */ (function () {
        function NgxGaugeModule() {
        }
        return NgxGaugeModule;
    }());
    NgxGaugeModule.decorators = [
        { type: core.NgModule, args: [{
                    imports: [common.CommonModule],
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

    exports.NgxGaugeModule = NgxGaugeModule;
    exports.ɵa = NgxGauge;
    exports.ɵb = NgxGaugeAppend;
    exports.ɵc = NgxGaugePrepend;
    exports.ɵd = NgxGaugeValue;
    exports.ɵe = NgxGaugeLabel;

    Object.defineProperty(exports, '__esModule', { value: true });

})));
//# sourceMappingURL=ngx-gauge.umd.js.map

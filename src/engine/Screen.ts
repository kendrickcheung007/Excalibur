import { vec, Vector } from './Math/vector';
import { Logger } from './Util/Log';
import { Camera } from './Camera';
import { BrowserEvents } from './Util/Browser';
import { BoundingBox } from './Collision/Index';
import { ExcaliburGraphicsContext } from './Graphics/Context/ExcaliburGraphicsContext';
import { getPosition } from './Util/Util';
import { ExcaliburGraphicsContextWebGL } from './Graphics/Context/ExcaliburGraphicsContextWebGL';
import { ExcaliburGraphicsContext2DCanvas } from './Graphics/Context/ExcaliburGraphicsContext2DCanvas';

/**
 * Enum representing the different display modes available to Excalibur.
 */
export enum DisplayMode {
  /**
   * Default, use a specified resolution for the game. Like 800x600 pixels for example.
   */
  Fixed = 'Fixed',

  /**
   * Fit an aspect ratio of the screen within the container at all times will fill the screen. This displayed area outside the aspect ratio
   * is not guaranteed to be on the screen, only the [[Screen.contentArea]] is guaranteed to be on screen.
   */
  FitContainerAndFill = 'ContentFitContainer',

  /**
   * Fit an aspect ratio within the screen at all times will fill the screen. This displayed area outside the aspect ratio is not
   * guaranteed to be on the screen, only the [[Screen.contentArea]] is guaranteed to be on screen.
   */
  FitScreenAndFill = 'ContentFitScreen',

  /**
   * Fit to screen using as much space as possible while maintaining aspect ratio and resolution.
   * This is not the same as [[Screen.goFullScreen]] but behaves in a similar way maintaining aspect ratio.
   *
   * You may want to center your game here is an example
   * ```html
   * <!-- html -->
   * <body>
   * <main>
   *   <canvas id="game"></canvas>
   * </main>
   * </body>
   * ```
   *
   * ```css
   * // css
   * main {
   *   display: flex;
   *   align-items: center;
   *   justify-content: center;
   *   height: 100%;
   *   width: 100%;
   * }
   * ```
   */
  FitScreen = 'FitScreen',

  /**
   * Fill the entire screen's css width/height for the game resolution dynamically. This means the resolution of the game will
   * change dynamically as the window is resized. This is not the same as [[Screen.goFullScreen]]
   */
  FillScreen = 'FillScreen',

  /**
   * Fit to parent element width/height using as much space as possible while maintaining aspect ratio and resolution.
   */
  FitContainer = 'FitContainer',

  /**
   * Use the parent DOM container's css width/height for the game resolution dynamically
   */
  FillContainer = 'FillContainer'
}

/**
 * Convenience class for quick resolutions
 * Mostly sourced from https://emulation.gametechwiki.com/index.php/Resolution
 */
export class Resolution {
  /* istanbul ignore next */
  public static get SVGA(): ScreenDimension {
    return { width: 800, height: 600 };
  }

  /* istanbul ignore next */
  public static get Standard(): ScreenDimension {
    return { width: 1920, height: 1080 };
  }

  /* istanbul ignore next */
  public static get Atari2600(): ScreenDimension {
    return { width: 160, height: 192 };
  }

  /* istanbul ignore next */
  public static get GameBoy(): ScreenDimension {
    return { width: 160, height: 144 };
  }

  /* istanbul ignore next */
  public static get GameBoyAdvance(): ScreenDimension {
    return { width: 240, height: 160 };
  }

  /* istanbul ignore next */
  public static get NintendoDS(): ScreenDimension {
    return { width: 256, height: 192 };
  }

  /* istanbul ignore next */
  public static get NES(): ScreenDimension {
    return { width: 256, height: 224 };
  }

  /* istanbul ignore next */
  public static get SNES(): ScreenDimension {
    return { width: 256, height: 244 };
  }
}

export interface ScreenDimension {
  width: number;
  height: number;
}

export interface ScreenOptions {
  /**
   * Canvas element to build a screen on
   */
  canvas: HTMLCanvasElement;

  /**
   * Graphics context for the screen
   */
  context: ExcaliburGraphicsContext;

  /**
   * Browser abstraction
   */
  browser: BrowserEvents;
  /**
   * Optionally set antialiasing, defaults to true. If set to true, images will be smoothed
   */
  antialiasing?: boolean;
  /**
   * Optionally override the pixel ratio to use for the screen, otherwise calculated automatically from the browser
   */
  pixelRatio?: number;
  /**
   * Optionally specify the actual pixel resolution in width/height pixels (also known as logical resolution), by default the
   * resolution will be the same as the viewport. Resolution will be overridden by [[DisplayMode.FillContainer]] and
   * [[DisplayMode.FillScreen]].
   */
  resolution?: ScreenDimension;
  /**
   * Visual viewport size in css pixel, if resolution is not specified it will be the same as the viewport
   */
  viewport: ScreenDimension;
  /**
   * Set the display mode of the screen, by default DisplayMode.Fixed.
   */
  displayMode?: DisplayMode;
}

/**
 * The Screen handles all aspects of interacting with the screen for Excalibur.
 */
export class Screen {
  public graphicsContext: ExcaliburGraphicsContext;
  private _canvas: HTMLCanvasElement;
  private _antialiasing: boolean = true;
  private _contentResolution: ScreenDimension;
  private _browser: BrowserEvents;
  private _camera: Camera;
  private _resolution: ScreenDimension;
  private _resolutionStack: ScreenDimension[] = [];
  private _viewport: ScreenDimension;
  private _viewportStack: ScreenDimension[] = [];
  private _pixelRatioOverride: number | null = null;
  private _displayMode: DisplayMode;
  private _isFullScreen = false;
  private _mediaQueryList: MediaQueryList;
  private _isDisposed = false;
  private _logger = Logger.getInstance();
  private _resizeObserver: ResizeObserver;

  constructor(options: ScreenOptions) {
    this.viewport = options.viewport;
    this.resolution = options.resolution ?? { ...this.viewport };
    this._contentResolution = this.resolution;
    this._displayMode = options.displayMode ?? DisplayMode.Fixed;
    this._canvas = options.canvas;
    this.graphicsContext = options.context;
    this._antialiasing = options.antialiasing ?? this._antialiasing;
    this._browser = options.browser;
    this._pixelRatioOverride = options.pixelRatio;

    this._applyDisplayMode();

    this._listenForPixelRatio();

    this._canvas.addEventListener('fullscreenchange', this._fullscreenChangeHandler);
    this.applyResolutionAndViewport();
  }

  private _listenForPixelRatio() {
    if (this._mediaQueryList && !this._mediaQueryList.addEventListener) {
      // Safari <=13.1 workaround, remove any existing handlers
      this._mediaQueryList.removeListener(this._pixelRatioChangeHandler);
    }
    this._mediaQueryList = this._browser.window.nativeComponent.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);

    // Safari <=13.1 workaround
    if (this._mediaQueryList.addEventListener) {
      this._mediaQueryList.addEventListener('change', this._pixelRatioChangeHandler, { once: true });
    } else {
      this._mediaQueryList.addListener(this._pixelRatioChangeHandler);
    }
  }

  public dispose(): void {
    if (!this._isDisposed) {
      // Clean up handlers
      this._isDisposed = true;
      this._browser.window.off('resize', this._resizeHandler);
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
      }
      this.parent.removeEventListener('resize', this._resizeHandler);
      // Safari <=13.1 workaround
      if (this._mediaQueryList.removeEventListener) {
        this._mediaQueryList.removeEventListener('change', this._pixelRatioChangeHandler);
      } else {
        this._mediaQueryList.removeListener(this._pixelRatioChangeHandler);
      }
      this._canvas.removeEventListener('fullscreenchange', this._fullscreenChangeHandler);
    }
  }

  private _fullscreenChangeHandler = () => {
    this._isFullScreen = !this._isFullScreen;
    this._logger.debug('Fullscreen Change', this._isFullScreen);
  };

  private _pixelRatioChangeHandler = () => {
    this._logger.debug('Pixel Ratio Change', window.devicePixelRatio);
    this._listenForPixelRatio();
    this._devicePixelRatio = this._calculateDevicePixelRatio();
    this.applyResolutionAndViewport();
  };

  private _resizeHandler = () => {
    const parent = this.parent;
    this._logger.debug('View port resized');
    this._setResolutionAndViewportByDisplayMode(parent);
    this.applyResolutionAndViewport();
  };

  private _calculateDevicePixelRatio() {
    if (window.devicePixelRatio < 1) {
      return 1;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;

    return devicePixelRatio;
  }

  // Asking the window.devicePixelRatio is expensive we do it once
  private _devicePixelRatio = this._calculateDevicePixelRatio();

  public get pixelRatio(): number {
    if (this._pixelRatioOverride) {
      return this._pixelRatioOverride;
    }

    return this._devicePixelRatio;
  }

  public get isHiDpi() {
    return this.pixelRatio !== 1;
  }

  public get displayMode(): DisplayMode {
    return this._displayMode;
  }

  public get canvas(): HTMLCanvasElement {
    return this._canvas;
  }

  public get parent(): HTMLElement | Window {
    switch (this.displayMode) {
      case DisplayMode.FillContainer:
      case DisplayMode.FitContainer:
      case DisplayMode.FitContainerAndFill:
        return this.canvas.parentElement || document.body;
      default:
        return window;
    }
  }

  public get resolution(): ScreenDimension {
    return this._resolution;
  }

  public set resolution(resolution: ScreenDimension) {
    this._resolution = resolution;
  }

  public get viewport(): ScreenDimension {
    if (this._viewport) {
      return this._viewport;
    }
    return this._resolution;
  }

  public set viewport(viewport: ScreenDimension) {
    this._viewport = viewport;
  }

  public get aspectRatio() {
    return this._resolution.width / this._resolution.height;
  }

  public get scaledWidth() {
    return this._resolution.width * this.pixelRatio;
  }

  public get scaledHeight() {
    return this._resolution.height * this.pixelRatio;
  }

  public setCurrentCamera(camera: Camera) {
    this._camera = camera;
  }

  public pushResolutionAndViewport() {
    this._resolutionStack.push(this.resolution);
    this._viewportStack.push(this.viewport);

    this.resolution = { ...this.resolution };
    this.viewport = { ...this.viewport };
  }

  public peekViewport(): ScreenDimension {
    return this._viewportStack[this._viewportStack.length - 1];
  }

  public peekResolution(): ScreenDimension {
    return this._resolutionStack[this._resolutionStack.length - 1];
  }

  public popResolutionAndViewport() {
    this.resolution = this._resolutionStack.pop();
    this.viewport = this._viewportStack.pop();
  }

  private _alreadyWarned = false;
  public applyResolutionAndViewport() {
    this._canvas.width = this.scaledWidth;
    this._canvas.height = this.scaledHeight;

    if (this.graphicsContext instanceof ExcaliburGraphicsContextWebGL) {
      const supported = this.graphicsContext.checkIfResolutionSupported({
        width: this.scaledWidth,
        height: this.scaledHeight
      });
      if (!supported && !this._alreadyWarned) {
        this._alreadyWarned = true; // warn once
        this._logger.warn(
          `The currently configured resolution (${this.resolution.width}x${this.resolution.height}) and pixel ratio (${this.pixelRatio})` +
          ' are too large for the platform WebGL implementation, this may work but cause WebGL rendering to behave oddly.' +
          ' Try reducing the resolution or disabling Hi DPI scaling to avoid this' +
          ' (read more here https://excaliburjs.com/docs/screens#understanding-viewport--resolution).');
      }
    }

    if (this._antialiasing) {
      this._canvas.style.imageRendering = 'auto';
    } else {
      this._canvas.style.imageRendering = 'pixelated';
      // Fall back to 'crisp-edges' if 'pixelated' is not supported
      // Currently for firefox https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering
      if (this._canvas.style.imageRendering === '') {
        this._canvas.style.imageRendering = 'crisp-edges';
      }
    }
    this._canvas.style.width = this.viewport.width + 'px';
    this._canvas.style.height = this.viewport.height + 'px';

    // After messing with the canvas width/height the graphics context is invalidated and needs to have some properties reset
    this.graphicsContext.updateViewport(this.resolution);
    this.graphicsContext.resetTransform();
    this.graphicsContext.smoothing = this._antialiasing;
    if (this.graphicsContext instanceof ExcaliburGraphicsContext2DCanvas) {
      this.graphicsContext.scale(this.pixelRatio, this.pixelRatio);
    }
  }

  public get antialiasing() {
    return this._antialiasing;
  }

  public set antialiasing(isSmooth: boolean) {
    this._antialiasing = isSmooth;
    this.graphicsContext.smoothing = this._antialiasing;
  }

  /**
   * Returns true if excalibur is fullscreen using the browser fullscreen api
   */
  public get isFullScreen() {
    return this._isFullScreen;
  }

  /**
   * Requests to go fullscreen using the browser fullscreen api, requires user interaction to be successful.
   * For example, wire this to a user click handler.
   */
  public goFullScreen(): Promise<void> {
    return this._canvas.requestFullscreen();
  }

  /**
   * Requests to exit fullscreen using the browser fullscreen api
   */
  public exitFullScreen(): Promise<void> {
    return document.exitFullscreen();
  }

  /**
   * Takes a coordinate in normal html page space, for example from a pointer move event, and translates it to
   * Excalibur screen space.
   *
   * Excalibur screen space starts at the top left (0, 0) corner of the viewport, and extends to the
   * bottom right corner (resolutionX, resolutionY)
   * @param point
   */
  public pageToScreenCoordinates(point: Vector): Vector {
    let newX = point.x;
    let newY = point.y;

    if (!this._isFullScreen) {
      newX -= getPosition(this._canvas).x;
      newY -= getPosition(this._canvas).y;
    }

    // if fullscreen api on it centers with black bars
    // we need to adjust the screen to world coordinates in this case
    if (this._isFullScreen) {
      if (window.innerWidth / this.aspectRatio < window.innerHeight) {
        const screenHeight = window.innerWidth / this.aspectRatio;
        const screenMarginY = (window.innerHeight - screenHeight) / 2;
        newY = ((newY - screenMarginY) / screenHeight) * this.viewport.height;
        newX = (newX / window.innerWidth) * this.viewport.width;
      } else {
        const screenWidth = window.innerHeight * this.aspectRatio;
        const screenMarginX = (window.innerWidth - screenWidth) / 2;
        newX = ((newX - screenMarginX) / screenWidth) * this.viewport.width;
        newY = (newY / window.innerHeight) * this.viewport.height;
      }
    }

    newX = (newX / this.viewport.width) * this.resolution.width;
    newY = (newY / this.viewport.height) * this.resolution.height;

    return new Vector(newX, newY);
  }

  /**
   * Takes a coordinate in Excalibur screen space, and translates it to normal html page space. For example,
   * this is where html elements might live if you want to position them relative to Excalibur.
   *
   * Excalibur screen space starts at the top left (0, 0) corner of the viewport, and extends to the
   * bottom right corner (resolutionX, resolutionY)
   * @param point
   */
  public screenToPageCoordinates(point: Vector): Vector {
    let newX = point.x;
    let newY = point.y;

    newX = (newX / this.resolution.width) * this.viewport.width;
    newY = (newY / this.resolution.height) * this.viewport.height;

    if (this._isFullScreen) {
      if (window.innerWidth / this.aspectRatio < window.innerHeight) {
        const screenHeight = window.innerWidth / this.aspectRatio;
        const screenMarginY = (window.innerHeight - screenHeight) / 2;
        newY = (newY / this.viewport.height) * screenHeight + screenMarginY;
        newX = (newX / this.viewport.width) * window.innerWidth;
      } else {
        const screenWidth = window.innerHeight * this.aspectRatio;
        const screenMarginX = (window.innerWidth - screenWidth) / 2;
        newX = (newX / this.viewport.width) * screenWidth + screenMarginX;
        newY = (newY / this.viewport.height) * window.innerHeight;
      }
    }

    if (!this._isFullScreen) {
      newX += getPosition(this._canvas).x;
      newY += getPosition(this._canvas).y;
    }

    return new Vector(newX, newY);
  }

  /**
   * Takes a coordinate in Excalibur screen space, and translates it to Excalibur world space.
   *
   * World space is where [[Entity|entities]] in Excalibur live by default [[CoordPlane.World]]
   * and extends infinitely out relative from the [[Camera]].
   * @param point  Screen coordinate to convert
   */
  public screenToWorldCoordinates(point: Vector): Vector {
    // the only difference between screen & world is the camera transform
    if (this._camera) {
      return this._camera.inverse.multiply(point);
    }
    return point.sub(vec(this.resolution.width / 2, this.resolution.height / 2));
  }

  /**
   * Takes a coordinate in Excalibur world space, and translates it to Excalibur screen space.
   *
   * Screen space is where [[ScreenElement|screen elements]] and [[Entity|entities]] with [[CoordPlane.Screen]] live.
   * @param point  World coordinate to convert
   */
  public worldToScreenCoordinates(point: Vector): Vector {
    if (this._camera) {
      return this._camera.transform.multiply(point);
    }
    return point.add(vec(this.resolution.width / 2, this.resolution.height / 2));
  }

  public pageToWorldCoordinates(point: Vector): Vector {
    const screen = this.pageToScreenCoordinates(point);
    return this.screenToWorldCoordinates(screen);
  }

  public worldToPageCoordinates(point: Vector): Vector {
    const screen = this.worldToScreenCoordinates(point);
    return this.screenToPageCoordinates(screen);
  }

  /**
   * Returns a BoundingBox of the top left corner of the screen
   * and the bottom right corner of the screen.
   *
   * World bounds are in world coordinates, useful for culling objects offscreen
   */
  public getWorldBounds(): BoundingBox {
    const topLeft = this.screenToWorldCoordinates(Vector.Zero);
    const right = topLeft.x + this.drawWidth;
    const bottom = topLeft.y + this.drawHeight;

    return new BoundingBox(topLeft.x, topLeft.y, right, bottom);
  }

  /**
   * The width of the game canvas in pixels (physical width component of the
   * resolution of the canvas element)
   */
  public get canvasWidth(): number {
    return this.canvas.width;
  }

  /**
   * Returns half width of the game canvas in pixels (half physical width component)
   */
  public get halfCanvasWidth(): number {
    return this.canvas.width / 2;
  }

  /**
   * The height of the game canvas in pixels, (physical height component of
   * the resolution of the canvas element)
   */
  public get canvasHeight(): number {
    return this.canvas.height;
  }

  /**
   * Returns half height of the game canvas in pixels (half physical height component)
   */
  public get halfCanvasHeight(): number {
    return this.canvas.height / 2;
  }

  /**
   * Returns the width of the engine's visible drawing surface in pixels including zoom and device pixel ratio.
   */
  public get drawWidth(): number {
    if (this._camera) {
      return this.resolution.width / this._camera.zoom;
    }
    return this.resolution.width;
  }

  /**
   * Returns half the width of the engine's visible drawing surface in pixels including zoom and device pixel ratio.
   */
  public get halfDrawWidth(): number {
    return this.drawWidth / 2;
  }

  /**
   * Returns the height of the engine's visible drawing surface in pixels including zoom and device pixel ratio.
   */
  public get drawHeight(): number {
    if (this._camera) {
      return this.resolution.height / this._camera.zoom;
    }
    return this.resolution.height;
  }

  /**
   * Returns half the height of the engine's visible drawing surface in pixels including zoom and device pixel ratio.
   */
  public get halfDrawHeight(): number {
    return this.drawHeight / 2;
  }

  /**
   * Returns screen center coordinates including zoom and device pixel ratio.
   */
  public get center(): Vector {
    return vec(this.halfDrawWidth, this.halfDrawHeight);
  }

  private _computeFit() {
    document.body.style.margin = '0px';
    document.body.style.overflow = 'hidden';
    const aspect = this.aspectRatio;
    let adjustedWidth = 0;
    let adjustedHeight = 0;
    if (window.innerWidth / aspect < window.innerHeight) {
      adjustedWidth = window.innerWidth;
      adjustedHeight = window.innerWidth / aspect;
    } else {
      adjustedWidth = window.innerHeight * aspect;
      adjustedHeight = window.innerHeight;
    }

    this.viewport = {
      width: adjustedWidth,
      height: adjustedHeight
    };
  }

  private _computeFitScreenAndFill() {
    document.body.style.margin = '0px';
    document.body.style.overflow = 'hidden';
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.viewport = {
      width: vw,
      height: vh
    };

    if (vw / vh <= this._contentResolution.width / this._contentResolution.height) {
      this.resolution = {
        width:  vw * this._contentResolution.width / vw,
        height: vw * this._contentResolution.width / vw * vh / vw
      };
    } else {
      this.resolution = {
        width: vh *  this._contentResolution.height / vh * vw / vh,
        height: vh *  this._contentResolution.height / vh
      };
    }
  }

  private _computeFitContainerAndFill() {
    document.body.style.margin = '0px';
    document.body.style.overflow = 'hidden';
    const parent = this.canvas.parentElement;
    const vw = parent.clientWidth;
    const vh = parent.clientHeight;
    this.viewport = {
      width: vw,
      height: vh
    };

    if (vw / vh <= this._contentResolution.width / this._contentResolution.height) {
      this.resolution = {
        width:  vw * this._contentResolution.width / vw,
        height: vw * this._contentResolution.width / vw * vh / vw
      };
    } else {
      this.resolution = {
        width: vh *  this._contentResolution.height / vh * vw / vh,
        height: vh *  this._contentResolution.height / vh
      };
    }
  }

  private _computeFitContainer() {
    const aspect = this.aspectRatio;
    let adjustedWidth = 0;
    let adjustedHeight = 0;
    const parent = this.canvas.parentElement;
    if (parent.clientWidth / aspect < parent.clientHeight) {
      adjustedWidth = parent.clientWidth;
      adjustedHeight = parent.clientWidth / aspect;
    } else {
      adjustedWidth = parent.clientHeight * aspect;
      adjustedHeight = parent.clientHeight;
    }

    this.viewport = {
      width: adjustedWidth,
      height: adjustedHeight
    };
  }

  private _applyDisplayMode() {
    this._setResolutionAndViewportByDisplayMode(this.parent);

    // watch resizing
    if (this.parent instanceof Window) {
      this._browser.window.on('resize', this._resizeHandler);
    } else {
      this._resizeObserver = new ResizeObserver(() => {
        this._resizeHandler();
      });
      this._resizeObserver.observe(this.parent);
    }
    this.parent.addEventListener('resize', this._resizeHandler);
  }

  /**
   * Sets the resolution and viewport based on the selected display mode.
   */
  private _setResolutionAndViewportByDisplayMode(parent: HTMLElement | Window) {
    if (this.displayMode === DisplayMode.FillContainer) {
      this.resolution = {
        width: (<HTMLElement> parent).clientWidth,
        height: (<HTMLElement> parent).clientHeight
      };

      this.viewport = this.resolution;
    }

    if (this.displayMode === DisplayMode.FillScreen) {
      document.body.style.margin = '0px';
      document.body.style.overflow = 'hidden';
      this.resolution = {
        width: (<Window> parent).innerWidth,
        height: (<Window> parent).innerHeight
      };

      this.viewport = this.resolution;
    }

    if (this.displayMode === DisplayMode.FitScreen) {
      this._computeFit();
    }

    if (this.displayMode === DisplayMode.FitContainer) {
      this._computeFitContainer();
    }

    if (this.displayMode === DisplayMode.FitScreenAndFill) {
      this._computeFitScreenAndFill();
    }

    if (this.displayMode === DisplayMode.FitContainerAndFill){
      this._computeFitContainerAndFill();
    }
  }
}

import {
  CSSResultGroup,
  LitElement,
  TemplateResult,
  css,
  html,
  nothing,
  svg,
} from "lit";

import { mdiTransmissionTower, mdiHelpRhombus } from "@mdi/js";
import { customElement, property } from "lit/decorators.js";

/**
 * Notes on graphical layout:
 *
 * The diagram contains elements that are fixed aspect ratio on the left,
 * and variable aspect ratio on the right. This is because the split of
 * renewables into two directions doesn't tend to stretch well and still
 * look good.
 *
 * The right side of the diagram shows the rates fanning out to consumers,
 * and this is much more easy to stretch. Changing the aspec ratio does not
 * adversely affect the diagram.
 *
 * The overall SVG is designed to fit within a bounding box, of 500px less
 * two 16px margins. Some experimentation with the value of
 * SVG_LHS_VISIBLE_WIDTH is needed to get the best fit.
 *
 * With the SVG_LHS_VISIBLE_WIDTH set, a scaling factor is automatically
 * calculated, and all other graphical elements are scaled by this factor.
 *
 * All other items in the diagram are an arbitrary scale, which is
 * multiplied by the scaling factor.
 *
 */

const TERMINATOR_BLOCK_LENGTH = 50;
const GENERATION_FAN_OUT_HORIZONTAL_GAP = 80;
const CONSUMERS_FAN_OUT_VERTICAL_GAP = 90;
const CONSUMER_LABEL_HEIGHT = 50;
const TARGET_SCALED_TRUNK_WIDTH = 90;

const GEN_COLOR = "#0d6a04";
const GRID_IN_COLOR = "#920e83";

const BLEND_LENGTH = 80;
const BLEND_LENGTH_PRE_FAN_OUT = 20;

const ARROW_HEAD_LENGTH = 10;
const TEXT_PADDING = 8;
const FONT_SIZE_PX = 16;
const ICON_SIZE_PX = 24;

const GEN_ORIGIN_X = 150;

const SVG_LHS_VISIBLE_WIDTH = 110;

export const PAD_ANTIALIAS = 0.5;

export interface ElecRoute {
  id?: string;
  text?: string;
  rate: number;
  icon?: string;
}

// Color mixing from here: https://stackoverflow.com/a/76752232
function hex2dec(hex: string) {
  const matched = hex.replace("#", "").match(/.{2}/g);
  if (!matched) throw new Error("Invalid hex string");
  return matched.map((n) => parseInt(n, 16));
}

function rgb2hex(r: number, g: number, b: number) {
  r = Math.round(r);
  g = Math.round(g);
  b = Math.round(b);
  r = Math.min(r, 255);
  g = Math.min(g, 255);
  b = Math.min(b, 255);
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

export function mixHexes(hex1: string, hex2: string, ratio: number = 0.5) {
  if (ratio > 1 || ratio < 0) {
    throw new Error("Invalid ratio: " + ratio);
  }
  const [r1, g1, b1] = hex2dec(hex1);
  const [r2, g2, b2] = hex2dec(hex2);
  const r = Math.round(r1 * ratio + r2 * (1 - ratio));
  const g = Math.round(g1 * ratio + g2 * (1 - ratio));
  const b = Math.round(b1 * ratio + b2 * (1 - ratio));
  return rgb2hex(r, g, b);
}
// End of color mixing code.

/**
 * Calculates the intersection point of two lines defined by their endpoints.
 * i.e. if the lines are defined by
 * (x1, y1) -> (x2, y2) and (x3, y3) -> (x4, y4),
 * As long as the two lines are not parallel, the function will return the
 * extrapolated intersection point of where the line x1,y1 -> x2,y2 intersects
 * the line x3,y3 -> x4,y4.
 */
function line_intersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  // Based on https://stackoverflow.com/a/38977789

  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) {
    // eslint-disable-next-line no-console
    console.log("Warning: Lines do not intersect.");
    return null;
  }
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  const x = x1 + ua * (x2 - x1);
  const y = y1 + ua * (y2 - y1);
  const seg1 = ua >= 0 && ua <= 1;
  const seg2 = ub >= 0 && ub <= 1;
  return [x, y, seg1, seg2];
}

/**
 * Draws a flow based on the corners of the start and end.
 * Rather than draw a curve between two points, this function takes the
 * corners of a large stripe between two end lines, and constructs a 4-corner
 * bezier shape to join them. This is useful for creating a flow map where
 * there are significant changes in direction but we don't want curves to
 * overlap.
 * An extreme fan-out a spread out list could result in significant overlap
 * if this were to be constructed with curves of constant width.
 */
function renderFlowByCorners(
  startLX: number,
  startLY: number,
  startRX: number,
  startRY: number,
  endLX: number,
  endLY: number,
  endRX: number,
  endRY: number,
  classname: string = "",
  color: string | null = null
): TemplateResult {
  // Don't attempt to draw curves for very narrow lines
  if (
    Math.sqrt((startLX - startLY) ** 2 + (startRX - startRY) ** 2) < 1 ||
    Math.sqrt((endLX - endLY) ** 2 + (endRX - endRY) ** 2) < 1
  ) {
    return svg``;
  }

  // Find points to make a line along the the half way fold
  // between the start and the end ('Mirror' line).
  const pointAX = (startLX + endLX) / 2;
  const pointAY = (startLY + endLY) / 2;
  const pointBX = (startRX + endRX) / 2;
  const pointBY = (startRY + endRY) / 2;
  // The bezier points are defined by the intersection between:
  // - the lines perpendicular to the ends
  // - the mirror line.
  const ret1 = line_intersect(
    startLX,
    startLY,
    startLX - (startRY - startLY),
    startLY - (startLX - startRX),
    pointAX,
    pointAY,
    pointBX,
    pointBY
  );
  const ret2 = line_intersect(
    endLX,
    endLY,
    endLX + (endRY - endLY),
    endLY + (endLX - endRX),
    pointAX,
    pointAY,
    pointBX,
    pointBY
  );

  const ret3 = line_intersect(
    endRX,
    endRY,
    endRX + (endRY - endLY),
    endRY + (endLX - endRX),
    pointAX,
    pointAY,
    pointBX,
    pointBY
  );
  const ret4 = line_intersect(
    startRX,
    startRY,
    startRX - (startRY - startLY),
    startRY - (startLX - startRX),
    pointAX,
    pointAY,
    pointBX,
    pointBY
  );
  if (ret1 == null || ret2 == null || ret3 == null || ret4 == null) {
    // eslint-disable-next-line no-console
    console.log("Warning: render flow failed.");
    return svg``;
  }
  const [bezierStartLX, bezierStartLY, ,] = ret1;
  const [bezierEndLX, bezierEndLY, ,] = ret2;
  const [bezierEndRX, bezierEndRY, ,] = ret3;
  const [bezierStartRX, bezierStartRY, ,] = ret4;
  const fillspec = color ? "fill:" + color : "";
  const svg_ret = svg`
  <path
      class="flow ${classname}"
      d="M ${startLX},${startLY}
      C ${bezierStartLX},${bezierStartLY} ${bezierEndLX},${bezierEndLY} ${endLX},${endLY}
      L ${endRX},${endRY}
      C ${bezierEndRX},${bezierEndRY} ${bezierStartRX},${bezierStartRY} ${startRX},${startRY} Z"
      style="${fillspec}"
  />
`;
  return svg_ret;
}

/**
 * Creates a flow map graphic showing the flow of electricity.
 *
 * In general, the aim of this class is to display a coherent and informative
 * visual representation of the flow of electricity. If a strange occurence
 * occurs, such as consumption exceeding total input power, the class should
 * attempt to display a sensible visual, including phantom sources or
 * consumers to convey a complete diagram.
 *
 * The reason for this is that the class is likely to receive asynchronous
 * updates from different sensors. It must display a glitch-free best
 * approximation of the reality until more information becomes available.
 *
 * Internally, the class deliberately avoids making reference to power or
 * energy because it can be used for either. By populating with
 * power (W) values it represents power flow. By populating with energy (kWh)
 * values it represents the energy flow over a period of time.
 * 'rate' is used as a generic variable name that can be power/energy.
 *
 * Architecture note:
 * While written for home assistant, this class deliberately makes no reference
 * to HA and is decoupled from it. It is designed to be subclassed within HA.
 *
 * The block of code below is useful when debugging the svg layouts.

* function debugPoint(x: number, y: number, label: string): TemplateResult {
 *   return svg`
 *     <circle cx="${x}" cy="${y}" r="3" fill="#22DDDD" />
 *     <text x="${x - 13}" y="${y - 6}" font-size="10px">${label}</text>
 * `;
 * }
 * ${debugPoint(x0, y0, "x0,y0")}
 * ${debugPoint(x1, y1, "x1,y1")} ${debugPoint(x2, y2, "x2,y2")}
 * ${debugPoint(x3, y3, "x3,y3")} ${debugPoint(x4, y4, "x4,y4")}
 * ${debugPoint(x5, y5, "x5,y5")} ${debugPoint(x6, y6, "x6,y6")}
 * ${debugPoint(x7, y7, "x7,y7")} ${debugPoint(x10, y10, "x10,y10")}
 */

@customElement("elec-sankey")
export class ElecSankey extends LitElement {
  @property()
  public unit: string = "kWh";

  @property({ attribute: false })
  public generationInRoutes: { [id: string]: ElecRoute } = {};

  @property({ attribute: false })
  public gridInRoute?: ElecRoute;

  @property({ attribute: false })
  public gridOutRoute?: ElecRoute;

  @property({ attribute: false })
  public consumerRoutes: { [id: string]: ElecRoute } = {};

  private _rateToWidthMultplier: number = 0.2;

  private _phantomGridInRoute?: ElecRoute;

  private _phantomGenerationInRoute?: ElecRoute;

  private _untrackedConsumerRoute: ElecRoute = {
    id: undefined,
    text: "Untracked",
    rate: 0,
  };

  private _generationTrackedTotal(): number {
    let totalGen = 0;
    for (const key in this.generationInRoutes) {
      if (Object.prototype.hasOwnProperty.call(this.generationInRoutes, key)) {
        totalGen += this.generationInRoutes[key].rate || 0;
      }
    }
    return totalGen;
  }

  private _generationPhantom(): number {
    return this._phantomGenerationInRoute
      ? this._phantomGenerationInRoute.rate
      : 0;
  }

  private _generationTotal(): number {
    return this._generationTrackedTotal() + this._generationPhantom();
  }

  private _gridImport(): number {
    if (this.gridInRoute) {
      return this.gridInRoute.rate > 0 ? this.gridInRoute.rate : 0;
    }
    return 0;
  }

  private _gridExport(): number {
    if (this.gridOutRoute) {
      return this.gridOutRoute.rate > 0 ? this.gridOutRoute.rate : 0;
    }
    if (this.gridInRoute) {
      return this.gridInRoute.rate < 0 ? -this.gridInRoute.rate : 0;
    }
    return 0;
  }

  private _consumerTrackedTotal(): number {
    let total = 0;
    for (const id in this.consumerRoutes) {
      if (Object.prototype.hasOwnProperty.call(this.consumerRoutes, id)) {
        total += this.consumerRoutes[id].rate;
      }
    }
    return total;
  }

  private _recalculate() {
    const gridImport = this._gridImport();
    const gridExport = this._gridExport();
    const generationTrackedTotal = this._generationTrackedTotal();
    const consumerTrackedTotal = this._consumerTrackedTotal();

    // Balance the books.
    let phantomGridIn = 0;
    let phantomGeneration = 0;
    let untrackedConsumer = 0;

    // First check if we are exporting more than we are generating.
    let x = gridExport - generationTrackedTotal;
    if (x > 0) {
      phantomGeneration = x;
    }
    // Do we have an excess of consumption?
    x =
      consumerTrackedTotal -
      gridImport -
      generationTrackedTotal -
      phantomGeneration;
    if (x > 0) {
      // There is an unknown energy source.
      if (this.gridInRoute === undefined && this.gridOutRoute === undefined) {
        // If we aren't tracking grid sources, create a phantom one.
        phantomGridIn = x;
      }
    }
    // Retry balance - are we consuming more than we are generating/importing?
    x =
      consumerTrackedTotal -
      gridImport -
      phantomGridIn -
      phantomGeneration -
      (generationTrackedTotal - gridExport);
    if (x > 0) {
      // We must have an unknown generation source
      phantomGeneration += x;
    }

    x =
      consumerTrackedTotal -
      gridImport -
      phantomGridIn -
      (generationTrackedTotal + phantomGeneration - gridExport);
    if (x < 0) {
      // There is an untracked energy consumer.
      untrackedConsumer = -x;
    }

    this._phantomGridInRoute =
      phantomGridIn > 0
        ? {
          text: "Unknown source",
          icon: mdiHelpRhombus,
          rate: phantomGridIn,
        }
        : undefined;
    this._phantomGenerationInRoute =
      phantomGeneration > 0
        ? {
          text: "Unknown source",
          icon: mdiHelpRhombus,
          rate: phantomGeneration,
        }
        : undefined;
    this._untrackedConsumerRoute.rate = untrackedConsumer;

    /**
     * Calculate and update a scaling factor to make the UI look sensible.
     * Since there is no limit to the value of input/output rates, the scaling
     * needs to be dynamic. This function calculates the scaling factor based
     * on a sensible maximum 'trunk' width.
     */
    const genTotal =
      generationTrackedTotal +
      (this._phantomGenerationInRoute
        ? this._phantomGenerationInRoute.rate
        : 0);
    const gridInTotal =
      gridImport +
      (this._phantomGridInRoute ? this._phantomGridInRoute.rate : 0);
    const consumerTotal =
      consumerTrackedTotal +
      (this._untrackedConsumerRoute ? this._untrackedConsumerRoute.rate : 0);

    const widest_trunk = Math.max(genTotal, gridInTotal, consumerTotal, 1.0);
    this._rateToWidthMultplier = TARGET_SCALED_TRUNK_WIDTH / widest_trunk;
    console.log("NEW Rate to width multiplier: " + this._rateToWidthMultplier);
  }

  private _generationToConsumers(): number {
    // @todo if we support batteries in the future, need to modify this.
    const genToGrid = this._gridExport();
    if (genToGrid > 0) {
      return this._generationTotal() - genToGrid;
    }
    return this._generationTotal();
  }

  private _rateToWidth(rate: number): number {
    const value = rate * this._rateToWidthMultplier;
    return value > 1 ? value : 1;
  }

  private _generationInFlowWidth(): number {
    const total = this._generationTrackedTotal() + this._generationPhantom()
    if (total === 0) {
      return 0;
    }
    return this._rateToWidth(total);
  }

  private _generationToConsumersFlowWidth(): number {
    if (this._generationToConsumers() == 0 && !this.generationInRoutes.length) {
      return 0;
    }
    return this._rateToWidth(this._generationToConsumers());
  }

  private _generationToGridFlowWidth(): number {
    if (this._gridExport() <= 0) {
      return 0;
    }
    if (this.gridOutRoute) {
      return this._rateToWidth(this._gridExport());
    }
    if (!this.gridInRoute) {
      return 0;
    }
    if (this.gridInRoute.rate > 0) {
      return 0;
    }
    return this._rateToWidth(-this.gridInRoute.rate);
  }

  private _gridInFlowWidth(): number {
    if (this.gridInRoute === undefined) {
      return 0;
    }
    if (this.gridInRoute.rate > 0) {
      return this._rateToWidth(this.gridInRoute.rate);
    }
    return 0;
  }

  private _gridOutFlowWidth(): number {
    if (this.gridOutRoute === undefined) {
      return 0;
    }
    if (this.gridOutRoute.rate > 0) {
      return this._rateToWidth(this.gridOutRoute.rate);
    }
    return 0;
  }

  private _consumersFanOutTotalHeight(): number {
    let totalHeight = 0;
    let count = 0;
    for (const id in this.consumerRoutes) {
      if (Object.prototype.hasOwnProperty.call(this.consumerRoutes, id)) {
        totalHeight += this._rateToWidth(this.consumerRoutes[id].rate);
        count++;
      }
    }
    const untracked = this._untrackedConsumerRoute.rate;
    totalHeight += this._rateToWidth(untracked);
    count++;

    if (count > 0) {
      totalHeight += (count - 1) * CONSUMERS_FAN_OUT_VERTICAL_GAP;
    }
    return totalHeight;
  }

  private _genColor(): string {
    const computedStyles = getComputedStyle(this);
    const ret = computedStyles.getPropertyValue("--generation-color").trim();
    return ret || GEN_COLOR;
  }

  private _gridColor(): string {
    const computedStyles = getComputedStyle(this);
    const ret = computedStyles.getPropertyValue("--grid-in-color").trim();
    return ret || GRID_IN_COLOR;
  }

  protected _generateLabelDiv(
    _id: string | undefined,
    icon: string | undefined,
    _name: string | undefined,
    valueA: number,
    valueB: number | undefined = undefined
  ): TemplateResult {
    const valueARounded = Math.round(valueA * 10) / 10;
    const valueBRounded = valueB ? Math.round(valueB * 10) / 10 : undefined;

    return html`
      <div class="label">
        <svg x="0" y="0" height=${ICON_SIZE_PX}>
          <path d=${icon} />
        </svg>
        <br />
        ${valueBRounded
        ? html`
              OUT ${valueBRounded} ${this.unit}<br />
              IN ${valueARounded} ${this.unit}
            `
        : html` ${_name}<br />${valueARounded} ${this.unit} `}
      </div>
    `;
  }

  protected _generationToConsumersRadius(): number {
    return 50 + this._generationToConsumersFlowWidth();
  }

  protected renderGenerationToConsumersFlow(
    x0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    svgScaleX: number = 1
  ): [TemplateResult[] | symbol[], TemplateResult | symbol] {
    const totalGenWidth = this._generationInFlowWidth();
    const genToConsWidth = this._generationToConsumersFlowWidth();

    if ((totalGenWidth === 0) && !Object.keys(this.generationInRoutes)) {
      return [[nothing], nothing];
    }
    const count =
      Object.keys(this.generationInRoutes).length +
      (this._phantomGenerationInRoute !== undefined ? 1 : 0);
    const fanOutWidth =
      totalGenWidth + (count - 1) * GENERATION_FAN_OUT_HORIZONTAL_GAP;
    let xA = GEN_ORIGIN_X - fanOutWidth / 2;
    let xB = GEN_ORIGIN_X - totalGenWidth / 2;
    const svgArray: TemplateResult[] = [];
    const divArray: TemplateResult[] = [];

    const startTerminatorY = 0;
    let phantomRate = 0;
    const routes = structuredClone(this.generationInRoutes);
    if (this._phantomGenerationInRoute !== undefined) {
      routes.phantom = this._phantomGenerationInRoute;
      phantomRate = this._phantomGenerationInRoute.rate;
    }
    let i = 0;
    // eslint-disable-next-line guard-for-in
    for (const key in routes) {
      if (Object.prototype.hasOwnProperty.call(routes, key)) {
        // const friendlyName = routes.text;
        let width = 0;
        const rate = routes[key].rate || 0; // Handle undefined (NaN) rates.
        // Most of the time, if the rate is zero, we don't want to draw it.
        // Exception is if we have a >0 phantom source.
        if (rate || phantomRate > 0) {
          width = this._rateToWidth(rate);
          svgArray.push(
            renderFlowByCorners(
              xA + width,
              startTerminatorY,
              xA,
              startTerminatorY,
              xB + width,
              startTerminatorY + TERMINATOR_BLOCK_LENGTH,
              xB,
              startTerminatorY + TERMINATOR_BLOCK_LENGTH,
              "generation"
            )
          );
          svgArray.push(
            svg`
            <polygon points="${xA + width},${startTerminatorY}
            ${xA},${startTerminatorY},
            ${xA + width / 2},${startTerminatorY + ARROW_HEAD_LENGTH}"
            class="tint"/>
          `
          );
        }

        const midX = xA + width / 2;
        const LABEL_WIDTH = 72;
        const icon = routes[key].icon;
        const id = routes[key].id || undefined;
        if (icon) {
          divArray.push(
            html`<div
              class="label elecroute-label-horiz"
              style="left: ${midX * svgScaleX -
              (i * LABEL_WIDTH) /
              2}px; flex-basis: ${LABEL_WIDTH}px; margin: 0 0 0 ${-LABEL_WIDTH /
              2}px;"
            >
              ${this._generateLabelDiv(id, icon, undefined, rate)}
            </div>`
          );
        }
        xA += width + GENERATION_FAN_OUT_HORIZONTAL_GAP;
        xB += width;
      }
      i++;
    }

    const generatedFlowPath2 =
      genToConsWidth > 0
        ? renderFlowByCorners(
          x0 + totalGenWidth,
          TERMINATOR_BLOCK_LENGTH - PAD_ANTIALIAS,
          x0 + totalGenWidth - genToConsWidth,
          TERMINATOR_BLOCK_LENGTH - PAD_ANTIALIAS,
          x1,
          y1,
          x2,
          y2,
          "generation"
        )
        : svg``;
    const svgRet = svg`
    ${svgArray}
    ${generatedFlowPath2}
    `;
    return [divArray, svgRet];
  }

  protected renderGenerationToGridFlow(
    x0: number,
    y0: number,
    x10: number,
    y10: number
  ): TemplateResult {
    const width = this._generationToGridFlowWidth();
    if (width === 0) {
      return svg``;
    }
    const generatedFlowPath = renderFlowByCorners(
      x0 + width,
      y0,
      x0,
      y0,
      x10,
      y10 + width,
      x10,
      y10,
      "generation"
    );

    return svg`
    ${generatedFlowPath}
    <rect
      class="generation"
      x=${ARROW_HEAD_LENGTH}
      y="${y10}"
      height="${width}"
      width="${x10 - ARROW_HEAD_LENGTH}"
    />
    <polygon
      class="generation"
      points="${ARROW_HEAD_LENGTH},${y10}
      ${ARROW_HEAD_LENGTH},${y10 + width}
      0,${y10 + width / 2}"
      />
  `;
  }

  protected renderGridInFlow(
    topRightX: number,
    topRightY: number,
    svgScaleX: number = 1
  ): [TemplateResult | symbol, TemplateResult | symbol] {
    if (!this.gridInRoute) {
      return [nothing, nothing];
    }
    const in_width = this._gridInFlowWidth();
    const tot_width = this._gridInFlowWidth() + this._gridOutFlowWidth();

    const startTerminatorX = 0;
    const startTerminatorY = topRightY;

    const x_width = topRightX;
    const rateA = this._gridImport();
    const rateB = this._gridExport();

    const midY = startTerminatorY - this._gridOutFlowWidth() + tot_width / 2;
    const divHeight = ICON_SIZE_PX + TEXT_PADDING + FONT_SIZE_PX * 2;
    const divRet = html`<div
      width=${ICON_SIZE_PX * 2}
      class="label elecroute-label-grid"
      style="left: 0px; height:${divHeight}px;
      top: ${midY * svgScaleX}px; margin: ${-divHeight / 2}px 0 0 0px;"
    >
      ${this._generateLabelDiv(
      this.gridInRoute.id,
      mdiTransmissionTower,
      undefined,
      rateA,
      rateB
    )}
    </div>`;

    const svgRet = svg`
    <rect
      class="grid"
      id="grid-in-rect"
      x="${startTerminatorX}"
      y="${startTerminatorY}"
      height="${in_width}"
      width="${x_width}"
    />
    <polygon points="${startTerminatorX},${startTerminatorY}
    ${startTerminatorX},${startTerminatorY + in_width}
    ${startTerminatorX + ARROW_HEAD_LENGTH},${startTerminatorY + in_width / 2}"
    class="tint"/>
  `;
    return [divRet, svgRet];
  }

  protected renderGenInBlendFlow(y1: number, endColor: string): TemplateResult {
    const width = this._generationToConsumersFlowWidth();
    const svgRet = width
      ? svg`
    <defs>
      <linearGradient id="grad_grid" 0="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:${this._genColor()};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${endColor};stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect
      id="gen-in-blend-rect"
      x=0
      y="${y1}"
      height="${width}"
      width="${BLEND_LENGTH + 2 * PAD_ANTIALIAS}"
      fill="url(#grad_grid)"
    />
  `
      : svg``;
    return svgRet;
  }

  protected renderGridInBlendFlow(
    y2: number,
    endColor: string
  ): [TemplateResult, number] {
    const width = this._gridInFlowWidth();

    const y5 = y2 + width;

    const svgRet = svg`
    <defs>
      <linearGradient id="grad_gen" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:${this._gridColor()};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${endColor};stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect
      id="grid-in-blend-rect"
      x=0
      y="${y2}"
      height="${width}"
      width="${BLEND_LENGTH + 1}"
      fill="url(#grad_gen)"
      style="fill-opacity:1"
    />
  `;
    return [svgRet, y5];
  }

  protected _renderBlendedFlowPreFanOut(
    y4: number,
    y5: number,
    color: string
  ): TemplateResult {
    const svgRet = svg`
    <rect
      id="blended-flow-pre-fan-out-rect"
      x=${BLEND_LENGTH}
      y="${y4}"
      height="${y5 - y4}"
      width="${BLEND_LENGTH_PRE_FAN_OUT + 1}"
      style="fill:${color};fill-opacity:1"
    />
  `;
    return svgRet;
  }

  protected _insertExtras(
    _topLeftX: number,
    _topLeftY: number,
    _width: number,
    _color: string,
    _route: ElecRoute
  ): [number, TemplateResult] {
    return [0, svg``];
  }

  protected _renderConsumerFlow(
    topLeftX: number,
    topLeftY: number,
    topRightX: number,
    topRightY: number,
    consumer: ElecRoute,
    color: string,
    svgScaleX: number = 1,
    count: number = 1
  ): [TemplateResult, TemplateResult, number, number] {
    const width = this._rateToWidth(consumer.rate);
    const xEnd = topRightX;
    const yEnd = topRightY + width / 2;
    const svgFlow = renderFlowByCorners(
      topLeftX,
      topLeftY,
      topLeftX,
      topLeftY + width,
      topRightX + PAD_ANTIALIAS,
      topRightY,
      topRightX + PAD_ANTIALIAS,
      topRightY + width,
      "consumer",
      color
    );
    const [extrasLength, svgExtras] = this._insertExtras(
      topRightX,
      topRightY,
      width,
      color,
      consumer
    );

    const divHeight = CONSUMER_LABEL_HEIGHT;
    const divRet = html`<div
      class="label elecroute-label-consumer"
      style="height:${divHeight}px;
      top: ${yEnd * svgScaleX -
      (count * divHeight) / 2}px; margin: ${-divHeight / 2}px 0 0 0;"
    >
      ${this._generateLabelDiv(
        consumer.id,
        undefined,
        consumer.text,
        consumer.rate
      )}
    </div>`;

    const svgRet = svg`
      ${svgFlow}
      ${svgExtras}
      <polygon points="${xEnd + extrasLength},${yEnd - width / 2}
        ${xEnd + extrasLength},${yEnd + width / 2}
        ${xEnd + extrasLength + ARROW_HEAD_LENGTH},${yEnd}"
        style="fill:${color}" />
    `;

    const bottomLeftY = topLeftY + (consumer.rate !== 0 ? width : 0);
    const bottomRightY = topRightY + width;
    return [divRet, svgRet, bottomLeftY, bottomRightY];
  }

  protected _renderConsumerFlows(
    y6: number,
    y7: number,
    color: string,
    svgScaleX: number
  ): [Array<TemplateResult>, Array<TemplateResult>, number] {
    const divRetArray: Array<TemplateResult> = [];
    const svgRetArray: Array<TemplateResult> = [];
    const xLeft = 0;
    const xRight = 100 - ARROW_HEAD_LENGTH;
    let i = 0;
    const total_height = this._consumersFanOutTotalHeight();
    let yLeft = y6;
    let yRight = (y6 + y7) / 2 - total_height / 2;
    if (yRight < TEXT_PADDING) {
      yRight = TEXT_PADDING;
    }
    let svgRow: TemplateResult;
    let divRow: TemplateResult;
    for (const key in this.consumerRoutes) {
      if (Object.prototype.hasOwnProperty.call(this.consumerRoutes, key)) {
        [divRow, svgRow, yLeft, yRight] = this._renderConsumerFlow(
          xLeft,
          yLeft,
          xRight,
          yRight,
          this.consumerRoutes[key],
          color,
          svgScaleX,
          i++
        );
        divRetArray.push(divRow);
        svgRetArray.push(svgRow);
        yRight += CONSUMERS_FAN_OUT_VERTICAL_GAP;
      }
    }

    [divRow, svgRow, yLeft, yRight] = this._renderConsumerFlow(
      xLeft,
      yLeft,
      xRight,
      yRight,
      this._untrackedConsumerRoute,
      color,
      svgScaleX,
      i++
    );
    divRetArray.push(divRow);
    svgRetArray.push(svgRow);
    yRight += CONSUMERS_FAN_OUT_VERTICAL_GAP;

    if (svgRetArray.length > 0) {
      yRight += CONSUMERS_FAN_OUT_VERTICAL_GAP;
    }
    return [divRetArray, svgRetArray, yRight];
  }

  protected _gridBlendRatio(): number {
    if (!this.gridInRoute) {
      return 0;
    }
    const grid = this.gridInRoute.rate > 0 ? this.gridInRoute.rate : 0;
    const renewable =
      this._generationTrackedTotal() +
      this._generationPhantom() -
      this._gridExport();
    const ratio = grid / (grid + renewable);
    if (ratio < 0) {
      return 0;
    }
    if (ratio > 1) {
      return 1;
    }
    return ratio;
  }

  protected _rateInBlendColor(): string {
    return mixHexes(
      this._gridColor(),
      this._genColor(),
      this._gridBlendRatio()
    );
  }

  protected _calc_xy(): [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
  ] {
    const x0 = GEN_ORIGIN_X - this._generationInFlowWidth() / 2;
    const y0 = TERMINATOR_BLOCK_LENGTH;

    const widthGenToConsumers = this._generationToConsumersFlowWidth();
    const widthGenToGrid = this._generationToGridFlowWidth();
    const radiusGenToConsumers = 50 + widthGenToConsumers;
    const radiusGenToGrid = 50 + widthGenToGrid;
    const y1 = Math.max(
      TERMINATOR_BLOCK_LENGTH + radiusGenToConsumers - widthGenToConsumers / 2,
      TERMINATOR_BLOCK_LENGTH + radiusGenToGrid - widthGenToGrid / 2
    );
    const x1: number =
      x0 + widthGenToGrid + widthGenToConsumers / 2 + radiusGenToConsumers;

    const x2: number = x1;
    const y2: number = y1 + widthGenToConsumers;

    const temp = x0 + this._generationToGridFlowWidth() - (y2 - y0);
    const x10 = temp > ARROW_HEAD_LENGTH ? temp : ARROW_HEAD_LENGTH;
    const y10 = y2 - this._generationToGridFlowWidth();
    return [x0, y0, x1, y1, x2, y2, x10, y10];
  }

  protected render(): TemplateResult {
    console.log("###rendering sankey####")

    this._recalculate();
    const [x0, y0, x1, y1, x2, y2, x10, y10] = this._calc_xy();

    const generationToGridFlowSvg = this.renderGenerationToGridFlow(
      x0,
      y0,
      x10,
      y10
    );
    const blendColor = this._rateInBlendColor();

    const genInBlendFlowSvg = this.renderGenInBlendFlow(y1, blendColor);
    const [gridInBlendFlowSvg, y5] = this.renderGridInBlendFlow(y2, blendColor);
    const blendedFlowPreFanOut = this._renderBlendedFlowPreFanOut(
      y1,
      y5,
      blendColor
    );

    const svgCanvasWidth = x1;
    const svgVisibleWidth = SVG_LHS_VISIBLE_WIDTH;
    const svgScaleX = svgVisibleWidth / svgCanvasWidth;

    const [gridInDiv, gridInFlowSvg] = this.renderGridInFlow(x2, y2, svgScaleX);

    const [genInFlowDiv, genInFlowSvg] = this.renderGenerationToConsumersFlow(
      x0,
      x1,
      y1,
      x2,
      y2,
      svgScaleX
    );
    const [consOutFlowsDiv, consOutFlowsSvg, y8] = this._renderConsumerFlows(
      y1,
      y5,
      blendColor,
      svgScaleX
    );

    const ymax = Math.max(y5, y8);
    return html`<div class="card-content">
      <div class="col1 container">
        <div class="col1top padding"></div>
        ${gridInDiv}
      </div>
      <div class="col2 container">
        <div class="col2top container">${genInFlowDiv}</div>
        <div class="col2bottom container">
          <div class="sankey-left">
            <svg
              viewBox="0 0 ${svgCanvasWidth} ${ymax}"
              width="100%"
              style="min-width: ${svgVisibleWidth}px"
              height=${ymax * svgScaleX}
              preserveAspectRatio="none"
            >
              ${genInFlowSvg} ${generationToGridFlowSvg} ${gridInFlowSvg}
            </svg>
          </div>
          <div class="sankey-mid">
            <svg
              viewBox="0 0 100 ${ymax}"
              width="100%"
              height=${ymax * svgScaleX}
              preserveAspectRatio="none"
            >
              ${genInBlendFlowSvg} ${gridInBlendFlowSvg} ${blendedFlowPreFanOut}
            </svg>
          </div>
          <div class="sankey-right">
            <svg
              viewBox="0 0 100 ${ymax}"
              width="100%"
              height=${ymax * svgScaleX}
              preserveAspectRatio="none"
            >
              ${consOutFlowsSvg}
            </svg>
          </div>
        </div>
      </div>
      <div class="col3 container">
        <div class="col3top padding"></div>
        ${consOutFlowsDiv}
      </div>
    </div>`;
  }

  static styles: CSSResultGroup = css`
    .card-content {
      position: relative;
      direction: ltr;
      display: flex;
    }
    .col1 {
      flex: 1;
      min-width: 60px;
      max-width: 120px;
    }
    .col1top {
      height: 60px;
    }
    .col2 {
      justify-content: left;
      flex-grow: 1;
    }
    .col2top {
      height: 60px;
      display: flex;
      justify-content: left;
    }
    .col2bottom {
      display: flex;
      justify-content: left;
    }
    .sankey-left {
      flex: 1;
      flex-grow: 0;
    }
    .sankey-mid {
      flex: 1;
      flex-grow: 1;
      min-width: 20px;
    }
    .sankey-right {
      flex: 1;
      flex-grow: 2;
      min-width: 50px;
    }
    .col3 {
      flex: 1;
      min-width: 80px;
      max-width: 120px;
    }
    .col3top {
      height: 60px;
    }
    .label {
      flex: 1;
      position: relative;
    }
    .elecroute-label-grid {
      display: flex;
      text-align: center;
    }
    .elecroute-label-horiz {
      display: flex;
      flex: 0 0 auto;
      flex-grow: 0;
      flex-shrink: 0;
      text-align: center;
    }
    .elecroute-label-consumer {
      display: flex;
      align-items: center;
      flex-grow: 0;
      flex-shrink: 0;
      justify-content: left;
      padding-left: 6px;
      white-space: pre;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    svg {
      rect {
        stroke: none;
        stroke-width: 0;
      }
      path {
        stroke: none;
        stroke-width: 0;
      }
      polygon {
        stroke: none;
      }
      polygon.generation {
        fill: var(--generation-color, #0d6a04);
      }
      polygon.tint {
        fill: #000000;
        opacity: 0.2;
      }
      path.flow {
        fill: gray;
      }
      path.generation {
        fill: var(--generation-color, #0d6a04);
        stroke: var(--generation-color, #0d6a04);
        stroke-width: 0;
      }
      rect.generation {
        fill: var(--generation-color, #0d6a04);
        stroke-width: 0;
      }
      rect.grid {
        fill: var(--grid-in-color, #920e83);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "elec-sankey": ElecSankey;
  }
}

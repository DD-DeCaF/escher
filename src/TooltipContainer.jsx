/** @jsx h */
import preact, { h } from 'preact'
import { mouse as d3_mouse } from 'd3-selection'
import { select as d3_select } from 'd3-selection'

import CallbackManager from './CallbackManager'
import ReactWrapper from './ReactWrapper'
import _ from 'underscore'
import * as utils from './utils'
const PlacedDiv = require('./PlacedDiv')

/**
 * Manage the tooltip that lives in a PlacedDiv.
 * @param selection
 * @param map
 * @param tooltipComponent
 * @param zoom_container
 * @param tooltip_callbacks
 */
var TooltipContainer = utils.make_class()
// instance methods
TooltipContainer.prototype = {
  init: init,
  setup_map_callbacks: setup_map_callbacks,
  setup_zoom_callbacks: setup_zoom_callbacks,
  is_visible: is_visible,
  show: show,
  hide: hide,
  reactionSize: reactionSize,
  setReactionSize: setReactionSize,
  delay_hide: delay_hide,
  cancelHideTooltip: cancelHideTooltip
}
module.exports = TooltipContainer

// definitions
function init (selection, TooltipComponent, zoom_container, callbacks) {
  this.div = selection.append('div').attr('id', 'tooltip-container')
  this.TooltipComponent = TooltipComponent
  this.tooltipRef = null
  this.zoom_container = zoom_container
  this.tooltip_callbacks = callbacks
  this.setup_zoom_callbacks(zoom_container)

  // Create callback manager
  this.callback_manager = CallbackManager()

  this.div.on('mouseover', this.cancelHideTooltip.bind(this))
  this.div.on('mouseleave', this.hide.bind(this))

  this.map = null
  this.delay_hide_timeout = null
  this.currentHighlight = null
  this.currentTooltip = null

  // keep a reference to preact tooltip
  preact.render(
    <ReactWrapper
      callbackManager={this.callback_manager}
      component={this.TooltipComponent}
      refProp={instance => { this.tooltipRef = instance }}
    />,
    this.div.node()
  )
}

/**
 * Sets up the appropriate callbacks to show the input
 * @param {object} map - map object
 */
function setup_map_callbacks (map) {
  this.map = map
  this.placed_div = PlacedDiv(this.div, map, undefined, false)

  //
  map.callback_manager.set('show_tooltip.tooltip_container', function (type, d) {
    // Check if the current element is in the list of tooltips to display
    if (map.settings.get_option('enable_tooltips').indexOf(type
      .replace('reaction_', '')
      .replace('node_', '')
      .replace('gene_', '')) > -1) {
      this.show(type, d)
    }
  }.bind(this))

  //
  map.callback_manager.set('hide_tooltip.tooltip_container', this.hide.bind(this))
  // Hides the tooltip when the canvas is touched
  map.sel.selectAll('.canvas-group').on('touchend', this.hide.bind(this))
  map.callback_manager.set('delay_hide_tooltip.tooltip_container', this.delay_hide.bind(this))
  map.callback_manager.set('update_tooltip.tooltip_container', (type, sel) => {
    if (this.currentTooltip !== null) {
      let d = null
      sel.each(data => {
        if (data[type.replace('_label', '_id')] === this.currentTooltip.id) {
          d = data
        }
      })
      if (d === null) {
        console.warn(`Could not find tooltip data for ${this.currentTooltip}`)
      } else {
        this.show(type, d)
      }
    }
  })
}

function setup_zoom_callbacks (zoom_container) {
  zoom_container.callback_manager.set('zoom.tooltip_container', function () {
    if (this.is_visible()) {
      this.hide()
    }
  }.bind(this))
  zoom_container.callback_manager.set('go_to.tooltip_container', function () {
    if (this.is_visible()) {
      this.hide()
    }
  }.bind(this))
}

/**
 * Return visibility of tooltip container.
 * @return {Boolean} Whether tooltip is visible.
 */
function is_visible () {
  return this.placed_div.is_visible()
}

/**
 * Show and place the input.
 * @param {string} type - 'reaction_label', 'node_label', or 'gene_label'
 * @param {Object} d - D3 data for DOM element
 */
function show (type, d) {
  // d is the new highlight. Reset the previous highlight if it'spresent and it's not the same as d
  if (this.currentHighlight && this.currentHighlight.reaction_id !== d.reaction_id) {
    this.setReactionSize(this.currentHighlight.reaction_id, this.reactionSize(this.currentHighlight.data))
  }
  // Set the new highlight
  this.setReactionSize(d.reaction_id, this.reactionSize(d.data) * 2.1)
  this.currentHighlight = d
  // get rid of a lingering delayed hide
  this.cancelHideTooltip()

  if (_.contains([ 'reaction_label', 'node_label', 'gene_label', 'reaction_object', 'node_object' ], type)) {
    // Use a default height if the ref hasn't been connected yet
    const tooltipSize = (this.tooltipRef !== null && this.tooltipRef.getSize)
    ? this.tooltipRef.getSize()
    : { width: 270, height: 100 }
    this.currentTooltip = { type, id: d[type.replace('_label', '_id').replace('_object', '_id')] }
    const windowTranslate = this.zoom_container.window_translate
    const windowScale = this.zoom_container.window_scale
    const mapSize = this.map !== null ? this.map.get_size() : { width: 1000, height: 1000 }
    const offset = {x: 0, y: 0}
    const startPosX = (type.replace('reaction_', '').replace('node_', '').replace('gene_', '') === 'object')
      ? d.xPos
      : d.label_x
    const startPosY = (type.replace('reaction_', '').replace('node_', '').replace('gene_', '') === 'object')
      ? d.yPos
      : d.label_y
    const rightEdge = windowScale * startPosX + windowTranslate.x + tooltipSize.width
    const bottomEdge = windowScale * startPosY + windowTranslate.y + tooltipSize.height
    if (mapSize.width < 500) {
      if (rightEdge > mapSize.width) {
        offset.x = -(rightEdge - mapSize.width) / windowScale
      }
      if (bottomEdge > mapSize.height - 74) {
        offset.y = -(bottomEdge - mapSize.height + 77) / windowScale
      }
    } else {
      if (windowScale * startPosX + windowTranslate.x + 0.5 * tooltipSize.width > mapSize.width) {
        offset.x = -tooltipSize.width / windowScale
      } else if (rightEdge > mapSize.width) {
        offset.x = -(rightEdge - mapSize.width) / windowScale
      }
      if (windowScale * startPosY + windowTranslate.y + 0.5 * tooltipSize.height > mapSize.height - 45) {
        offset.y = -(tooltipSize.height) / windowScale
      } else if (bottomEdge > mapSize.height - 45) {
        offset.y = -(bottomEdge - mapSize.height + 47) / windowScale
      }
    }
    const [mouseX, mouseY] = d3_mouse(this.map.sel.node())
    const coords = { x: mouseX + 5, y: mouseY + 5 }
    this.placed_div.place(coords)
    const data = {
      biggId: d.bigg_id,
      name: d.name,
      loc: coords,
      data: d.data_string,
      tooltip_callbacks: this.tooltip_callbacks,
      type: type.replace('_label', '').replace('node', 'metabolite').replace('_object', '')
    }
    this.callback_manager.run('setState', null, data)
  } else {
    throw new Error('Tooltip not supported for object type ' + type)
  }
}

/**
 * Hide the input.
 */
function hide () {
  if (this.currentHighlight) {
    this.setReactionSize(this.currentHighlight.reaction_id, this.reactionSize(this.currentHighlight.data))
  }
  this.placed_div.hide();
}

/**
 * Get size for the reaction
 */

function reactionSize(data) {
  return data ? this.map.scale.reaction_size(data) : this.map.settings.get_option('reaction_no_data_size');
}

function setReactionSize(id, size) {
  d3_select(`#r${id}`)
    .selectAll('.segment')
    .transition()
    .style('stroke-width', size)
    .duration(100);
 }

/**
 * Hide the input after a short delay, so that mousing onto the tooltip does not
 * cause it to hide.
 */
function delay_hide () {
  this.delay_hide_timeout = setTimeout(function () {
    this.hide()
  }.bind(this), 100)
}

function cancelHideTooltip () {
  if (this.delay_hide_timeout !== null) {
    clearTimeout(this.delay_hide_timeout)
  }
}

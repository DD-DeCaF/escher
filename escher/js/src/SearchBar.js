define(["utils"], function(utils) {
    /** 
     */

    var SearchBar = utils.make_class();
    // instance methods
    SearchBar.prototype = { init: init,
			    is_visible: is_visible,
			    toggle: toggle,
			    update: update,
			    next: next,
			    previous: previous };

    return SearchBar;

    // instance methods
    function init(sel, search_index, map) {
	var container = sel.attr('class', 'search-container')
		.style('display', 'none');
	this.input = container.append('input')
	    .attr('class', 'search-bar');
	container.append('button')
	    .attr("class", "btn-sm btn-default glyphicon glyphicon-chevron-left")
	    .on('click', this.previous.bind(this));
	container.append('button')
	    .attr("class", "btn-sm btn-default glyphicon glyphicon-chevron-right")
	    .on('click', this.next.bind(this));
	this.counter = container.append('div')
	    .attr('class', 'search-counter');
	container.append('button')
	    .attr("class", "btn-sm btn-default glyphicon glyphicon-remove search-close-button")
	    .on('click', function() {
		this.toggle(false);
	    }.bind(this));
	
	this.selection = container;
	this.map = map;
	this.search_index = search_index;

	this.current = 1;
	this.results = null;

	this.input.on('input', function(input) {
	    this.current = 1;
	    this.results = this.search_index.find(input.value);
	    this.update();
	}.bind(this, this.input.node()));
    }
    function is_visible() {
	return this.selection.style('display') != 'none';
    }
    function toggle(on_off) {
	if (on_off===undefined) this.is_active = !this.is_active;
	else this.is_active = on_off;

	if (this.is_active) {
	    this.selection.style('display', null);
	    this.counter.text("");
	    this.input.node().value = "";
	    this.input.node().focus();
	    // escape key
	    this.escape = this.map.key_manager
		.add_escape_listener(function() { this.toggle(false); }.bind(this));
	    // enter key
	    this.escape = this.map.key_manager
		.add_enter_listener(function() { this.next(); }.bind(this));
	} else {
	    this.map.highlight(null);
	    this.selection.style("display", "none");
	    this.results = null;
	    if (this.escape) this.escape.clear();
	    this.escape = null;
	    if (this.enter) this.enter.clear();
	    this.enter = null;
	}
    }
    function update() {
	if (this.results == null) {
	    this.counter.text("");
	    this.map.zoom_extent_canvas();
	    this.map.highlight(null);
	} else if (this.results.length == 0) {
	    this.counter.text("0 / 0");
	    this.map.zoom_extent_canvas();
	    this.map.highlight(null);
	} else {
	    this.counter.text(this.current + " / " + this.results.length);
	    var r = this.results[this.current - 1];
	    if (r.type=='reaction') {		
		this.map.zoom_to_reaction(r.reaction_id);
		this.map.highlight_reaction(r.reaction_id);
	    } else if (r.type=='metabolite') {
		this.map.zoom_to_node(r.node_id);
		this.map.highlight_node(r.node_id);
	    } else {
		throw new Error('Bad search index data type: ' + r.type);
	    }
	}
    }
    function next() {
	if (this.results == null) return;
	if (this.current==this.results.length)
	    this.current = 1;
	else
	    this.current += 1;
	this.update();
    }
    function previous() {
	if (this.results == null) return;
	if (this.current==1)
	    this.current = this.results.length;
	else
	    this.current -= 1;
	this.update();
    } 
});

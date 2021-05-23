function test(v) {
    tokens.forEach(t => t.simulate())
}

var node_width = 80;
var node_height = 40;
let time_scale = 250;

var svg = d3.select(".app-container .graph")
    .append("svg")
    .html('<defs> <filter id="shadow" y="-50px" height="400px" x="-50px" width="400px"><feDropShadow dx="0" dy="0" stdDeviation="10" flood-opacity="0.25"/></filter></defs>')
    .attr("width", document.querySelector('#app').getBoundingClientRect().width)
    .attr("height", '100%')
    .attr("class", "graph-svg-component")
    .on('mousedown', canvasMouseDown)
    .call(d3.zoom().on("zoom", function () {
        svg.attr("transform", d3.event.transform)
    }))
    .append('g')

function redraw() {
    d3.select('svg').attr("width", document.querySelector('#app').getBoundingClientRect().width)
        .attr("height", '100%')
}

window.addEventListener("resize", redraw);

var nodes = svg.selectAll("node")
var links = svg.selectAll("link")
var node_text = svg.selectAll('text')

var drag = d3.drag()
    .on('start', function () {
        d3.event.sourceEvent.stopPropagation()
    })
    .on("drag", nodeDragged);

update()

function getAllProcessDurations() {
    return app.flow_data.nodes.map(n => n.logs).map(l => l.transition_durations).flat();
}

function getAllOperatorDurations() {
    return app.flow_data.nodes.map(n => n.logs).map(l => l.operator_efforts).flat();
}

function getSelectedProcessDurations() {
    return d3.select(app.selected_node).data()[0].logs.transition_durations;
}

function getSelectedOperatorDurations() {
    return d3.select(app.selected_node).data()[0].logs.operator_efforts;
}

//adding a new node
//var nd_add_hist = 0;
function canvasMouseDown() {
    app.selected_seq = null;
    let all_node_names = app.flow_data.nodes.map(nn => nn.name);
    let all_node_ids = app.flow_data.nodes.map(nn => nn.id);
    let all_node_nodes = document.querySelectorAll(all_node_ids.map(nn => '#nd' + nn));
    all_node_nodes.forEach(nn => nn.classList.remove('highlighted'));

    let all_link_ids = app.flow_data.links.map(li => li.id);
    if (all_link_ids.length > 0) {
        let all_link_nodes = document.querySelectorAll(all_link_ids.map(nn => '#li' + nn));
        all_link_nodes.forEach(nn => nn.classList.remove('highlighted-link'));
    }

    if (d3.event.altKey && app.selected_node) {
        //nd_add_hist++;
        let new_li_id = app.flow_data.links.map(li => li.id).length > 0 ? math.max(app.flow_data.links.map(li => li.id)) + 1 : 0;
        let new_nd_id = app.flow_data.nodes.map(nd => nd.id).length > 0 ? math.max(app.flow_data.nodes.map(nd => nd.id)) + 1 : 0;
        app.flow_data.nodes.push({
            id: new_nd_id,//nd_add_hist,
            name: 'nd' + new_nd_id,//nd_add_hist,
            x: d3.mouse(d3.select(this).select('g').node())[0] - (node_width / 2),
            y: d3.mouse(d3.select(this).select('g').node())[1] - (node_height / 2),
            pdef: {
                tproc_dist: {
                    id: 0,
                    name: 'gamma',
                    parameter1: 0,
                    parameter2: 0
                },
                tso_dist: {
                    id: 0,
                    name: 'gamma',
                    parameter1: 0,
                    parameter2: 0
                },
                maxproc: 5,
                selfloop: 0
            },
            logs: {
                nnow: 0,
                nwaiting: 0,
                ntotal: 0,
                avg_tproc: 0,
                transition_durations: [],
                operator_efforts: [],
                backlog_history: []
            }
        })
        app.flow_data.links.push({
            id: new_li_id,
            name: 'li' + new_li_id,

            source: d3.select(app.selected_node).data()[0].id,
            target: new_nd_id,

            transit_time: 1,
            path_prob: 1,

            condition: false,
            condition_type: 'visited',
            condition_target: 0
        })

        update()
    } else {
        d3.select(app.selected_node).attr('class', 'node node-passive')
        app.selected_node = null
        d3.select(app.selected_link).attr('class', 'link link-passive')
        app.selected_link = null;
    }
}


function getSelectedNode() {
    return app.selected_node;
}

// ANCHOR token class definition
class Token {
    token = null;
    ended = false;
    init_delay = 0;
    _current_node = null;
    token_id = app.flow_data.token_data.length;
    new_token_details = {
        id: this.token_id,
        node_history: [],
        node_transition_duration_history: [],
        node_operator_effort_history: []
    };

    constructor(init_delay = 0) {
        this.init_delay = init_delay;
        app.flow_data.token_data.push(this.new_token_details);
    }

    translateToPoint(from, to) {
        let xdest = `${to.x - from.x}`
        let ydest = `${to.y - from.y}`
        return (`translate(${xdest} ${ydest})`)
    }

    trigger() {
        let delay = d3.randomUniform(this.init_delay)();
        let _this = this;
        setTimeout(function () {
            _this.tokenGenerated();
            _this.simulate();
        }, delay)
    }

    // ANCHOR simulation process
    simulate(current_node) {
        let tk_delay = 0;

        if (this.ended) {
            return
        }

        // make the first node the starning node initially
        if (!current_node) {
            current_node = d3.select('#nd0')
            tk_delay = this.init_delay
        } else {
            tk_delay = 0;
        }

        this._current_node = current_node;

        // setup current_node variables
        let current_node_data = {
            x: Number.parseFloat(current_node.attr('x')),
            y: Number.parseFloat(current_node.attr('y')) + (node_height / 2)
        }

        // add the current node to the token's visited node history
        app.flow_data.token_data[this.token_id].node_history.push({ id: current_node.data()[0].id, name: current_node.data()[0].name })
        let node_history = app.flow_data.token_data[this.token_id].node_history;

        let tproc_p1 = Number.parseFloat(current_node.data()[0].pdef.tproc_dist.parameter1);
        let tso_p1 = Number.parseFloat(current_node.data()[0].pdef.tso_dist.parameter1);

        let transition_duration = Number.parseFloat(jStat[current_node.data()[0].pdef.tso_dist.name].sample(tproc_p1, 1));
        let operator_effort = Number.parseFloat(jStat[current_node.data()[0].pdef.tso_dist.name].sample(tso_p1, 1));

        app.flow_data.token_data[this.token_id].node_transition_duration_history.push({ id: current_node.data()[0].id, time: transition_duration });
        app.flow_data.token_data[this.token_id].node_operator_effort_history.push({ id: current_node.data()[0].id, time: operator_effort });

        // setup target node from candidate links
        let candidate_next_links = app.flow_data.links.filter((li) => li.source == current_node.data()[0].id);
        let validated_candidate_next_links = [];

        for (var i = 0; i < candidate_next_links.length; i++) {
            let li = candidate_next_links[i];
            if (li.condition) {
                let condition_type = li.condition_type;
                let condition_target = li.condition_target;
                if (condition_type == 'visited') {
                    let visited_indicator = node_history.map((nh) => nh.id).includes(condition_target);
                    if (visited_indicator) {
                        validated_candidate_next_links.push(li);
                    }
                } else if (condition_type == 'not_visited') {
                    console.log('TODO not visited condition')
                }
            } else {
                validated_candidate_next_links.push(li);
            }
        }

        let next_node_data = null;
        let next_node = null;
        if (validated_candidate_next_links.length > 0) {
            let candidate_node_ids = validated_candidate_next_links.map(nd => nd.target)
            let probs = validated_candidate_next_links.map(li => Number.parseFloat(li.path_prob))
            let next_node_id = chance.weighted(candidate_node_ids, probs)
            next_node = d3.select('#nd' + next_node_id)
            next_node_data = {
                x: Number.parseFloat(next_node.attr('x')),
                y: Number.parseFloat(next_node.attr('y')) + (node_height / 2)
            }
        }

        // create a token if there isnt one in the instance
        if (!this.token) {
            this.token = svg.append("circle")
                .attr('cx', current_node_data.x)
                .attr('cy', current_node_data.y)
                .attr('r', 0)
                .attr('class', 'token')
        }

        // transition to the end of the node
        let _this = this;
        let tks = this.token
            .attr('cx', current_node_data.x)
            .attr('cy', current_node_data.y)
            .call(function (d) {
                d.transition('plink')
                    .ease(d3.easeElastic)
                    .duration(d3.randomUniform(600)() + 1000)
                    .attr('r', 5)
            })
            .transition()
            .on('start', function (d, i, v) {
                let cnd = app.flow_data.nodes.filter(nd => nd.id == current_node.data()[0].id)[0];
            })
            .ease(d3.easeLinear)
            .duration(transition_duration * time_scale)
            .attr('transform', this.translateToPoint(
                { x: current_node_data.x, y: current_node_data.y },
                { x: current_node_data.x + node_width, y: current_node_data.y + d3.randomUniform(-7, 7)() }
            )).call(function (d) {
                //ANCHOR node entered
                _this.nodeEntered(current_node)
            })
            .on('end', function () {
                _this.updateNodeLogs(current_node, {
                    transition_duration: transition_duration,
                    operator_effort: operator_effort
                })
                //ANCHOR node exited
                _this.nodeExited(current_node)
            })
        if (next_node_data) {
            tks.transition()
                .ease(d3.easeLinear)
                .duration(1 * time_scale)
                .attr('transform', this.translateToPoint(
                    { x: _this.token.attr('cx'), y: _this.token.attr('cy') },
                    { x: next_node_data.x, y: next_node_data.y }
                ))
                .on('end', function () {
                    d3.select(this).attr('transform', null)
                    if (next_node) {
                        _this.simulate(next_node)
                    }
                })
        } else {
            tks.transition()
                .ease(d3.easeLinear)
                .duration(200)
                .attr('r', 0)
                .on('end', function () {
                    let cnd = app.flow_data.nodes.filter(nd => nd.id == current_node.data()[0].id)[0];
                    _this.tokenDestroyed();
                    d3.select(this).remove()
                })
            this.ended = true;
        }
    }

    tokenGenerated(time = 0) {
        if (app.flow_data.generated_token_ids.indexOf(this.token_id) < 0) {
            app.flow_data.generated_token_ids.push(this.token_id);

            let current_system_backlog = app.flow_data.system_backlog_history.slice(-1)[0];
            if (!current_system_backlog) {
                current_system_backlog = 0;
            }
            app.flow_data.system_backlog_history.push(current_system_backlog + 1);
        }
    }

    tokenDestroyed() {
        let current_system_backlog = app.flow_data.system_backlog_history.slice(-1);
        app.flow_data.system_backlog_history.push(current_system_backlog - 1);
    }

    nodeEntered(node) {
        app.flow_data.nodes.filter(nd => nd.id == node.data()[0].id)[0].logs.nnow++;
        let nnow = app.flow_data.nodes.filter(nd => nd.id == node.data()[0].id)[0].logs.nnow;
        app.flow_data.nodes.filter(nd => nd.id == node.data()[0].id)[0].logs.backlog_history.push(nnow);
    }

    nodeExited(node) {
        app.flow_data.nodes.filter(nd => nd.id == node.data()[0].id)[0].logs.nnow--;
    }

    updateNodeLogs(node, log_data) {
        node.data()[0].logs.ntotal++;


        if (!node.data()[0].logs.transition_durations) {
            node.data()[0].logs.transition_durations = []
        }
        if (!node.data()[0].logs.operator_efforts) {
            node.data()[0].logs.operator_efforts = []
        }

        node.data()[0].logs.transition_durations.push(log_data.transition_duration)
        node.data()[0].logs.operator_efforts.push(log_data.operator_effort)

        node.data()[0].logs.avg_tproc = d3.mean(node.data()[0].logs.transition_durations).toFixed(2)

        // update the heatmap
        if (app.heatmap) {
            app.setHeatmap();
        }
    }
}



document.addEventListener("keydown", function (event) {
    if (event.key === "Delete") {
        var iid = d3.select(app.selected_node).data()[0].id;
        app.flow_data.nodes = app.flow_data.nodes.filter(nd => nd.id != iid)
        app.flow_data.links = app.flow_data.links.filter(li => li.source != iid && li.target != iid)
        update()
    }
});

function setNodeAsActive(node, last_selected) {
    app.selected_seq = null;
    d3.select(last_selected).attr('class', 'node node-passive')
    app.selected_node = node;
    d3.select(app.selected_node).attr('class', 'node node-active')
    app.selected_link = null;

    update()
}

function setLinkAsActive(link, last_selected) {
    app.selected_seq = null;
    d3.select(last_selected).attr('class', 'link link-passive')
    app.selected_link = link;
    d3.select(app.selected_link).attr('class', 'link link-active')
    app.selected_node = null;
    update()
}

let tokens = []
function addToken() {
    let tk = new Token()
    tokens.push(tk)
    tk.tokenGenerated();
    tk.simulate()
}

function translateToPointOnCanvas(from, to) {
    let xdest = `${to.x - from.x}`
    let ydest = `${to.y - from.y}`
    return (`translate(${xdest} ${ydest})`)
}

function nodeDragged(d, i) {
    d.x = d3.mouse(this)[0] - (node_width / 2);
    d.y = d3.mouse(this)[1] - (node_height / 2);

    d3.select(this).attr("x", d.x).attr("y", d.y);

    node_text.each(function (nt, i) {
        d3.select(this).attr('x', nt.x)
        d3.select(this).attr('y', nt.y)
    });

    links.each(function (l, li) {
        if (l.source == i) {
            l.source_coords = { x: d.x + (node_width / 2), y: d.y + (node_height / 2) }
            d3.select(this)
                .attr("x1", d.x + (node_width))
                .attr("y1", d.y + (node_height / 2));
        } else if (l.target == i) {
            l.target_coords = { x: d.x + (node_width / 2), y: d.y + (node_height / 2) }
            d3.select(this)
                .attr("x2", d.x) //+ (node_width / 2))
                .attr("y2", d.y + (node_height / 2));
        }
    });

    update()
}

function showDistribution() {
    app.show_modal = true;
    console.log('asd')
}

function linkClicked(d, i) {
    d3.event.stopPropagation()
    let last_selected = app.selected_link;
    setLinkAsActive(this, last_selected)
}

// node clicked or node joined to existing
function nodeClicked(d, i) {
    let last_selected = app.selected_node;

    setNodeAsActive(this, last_selected)

    // join a node to this node
    if (d3.event.altKey) {
        let new_link_id = math.max(app.flow_data.links.map(li => li.id)) + 1;
        app.flow_data.links.push({
            id: new_link_id,
            name: 'li' + new_link_id,

            source: d3.select(last_selected).data()[0].id,
            target: d3.select(app.selected_node).data()[0].id,

            transit_time: 1,
            path_prob: 1,

            condition: false,
            condition_type: 'visited',
            condition_target: 0
        })
        update()
    }
}



function update() {
    links = links
        .data(app.flow_data.links)
        .join("line")
        .attr("class", "link")
        .attr('id', d => 'li' + d.id)
        .attr("x1", function (l) {
            var sourceNode = app.flow_data.nodes.filter(function (d, i) {
                return d.id == l.source
            })[0];
            d3.select(this).attr("y1", sourceNode.y + (node_height / 2));
            return sourceNode.x + (node_width)
        })
        .attr("x2", function (l) {
            var targetNode = app.flow_data.nodes.filter(function (d, i) {
                return d.id == l.target
            })[0];
            d3.select(this).attr("y2", targetNode.y + (node_height / 2));
            return targetNode.x //+ (node_width / 2)
        })
        .attr("class", "link link-passive")
        .attr('opacity', function (d) {
            let links = app.flow_data.links.filter(li => li.source == d.source)
            let prob_sum = links.map(li => Number.parseFloat(li.path_prob)).reduce(function (total, num) {
                return total + num
            }, 0)
            return Math.max(d.path_prob / prob_sum, 0.25)
        })
        .on('mousedown', linkClicked)

    nodes = nodes
        .data(app.flow_data.nodes)
        .join('rect')
        .style('filter', "url(#shadow)")
        .attr("class", "node")
        .attr('id', d => 'nd' + d.id)
        .attr("x", function (d) {
            return d.x
        })
        .attr("y", function (d) {
            return d.y
        })
        .attr("width", node_width)
        .attr('height', node_height)
        .attr("class", 'node node-passive')
        .on('click', nodeClicked)
        .call(drag)


    node_text = node_text
        .data(app.flow_data.nodes)
        .join('text')
        .attr('class', 'node-name')
        .text(d => d.name)
        .attr('x', function (d, i) {
            return d.x + (node_width / 2) - (this.getBBox().width / 2)
        })
        .attr('y', function (d, i) {
            return d.y + (node_height / 2) + (this.getBBox().height / 4)
        })
        .attr('pointer-events', 'none')

    nodes.raise()
    node_text.raise()
    d3.select(app.selected_node).attr('class', 'node node-active')
    d3.select(app.selected_link).attr('class', 'link link-active')
    d3.selectAll('circle').raise()
}




function runModel() {
    let n_tokens = app.n_sim_tokens;
    let seconds = app.sim_seconds;
    for (var i = 0; i < n_tokens; i++) {
        tokens.push(new Token(seconds))
    }
    tokens.forEach(t => t.trigger())
}

// ANCHOR Homogenous Poisson Process
function runHomogenousPoissonProcess(T_length = 100, lambda = 20) {
    // run the process by generating arrivals per a poisson process by sampling the interarrival time from an exp distribution
    // create a new token for every initial arrival
    // the end of this while loop will contain all the tokens that will be generated throughout the process
    // each token will be recursively processed to calculate its complete process trajectory

    let last_arrival = 0;
    let tokens = [];
    let inter_arrival = jStat.exponential.sample(lambda);
    let n = 0;
    while (inter_arrival + last_arrival < T_length) {
        last_arrival = inter_arrival + last_arrival;
        let new_token_obj = {
            tk_id:n, 
            arrivals:[{
                node_id: 0, 
                arrival_time: last_arrival, 
                transition_duration: 0,
                effort_duration: 0,
                departure_time: 0
            }]};
        tokens.push(new_token_obj);
        inter_arrival = jStat.exponential.sample(lambda);
        n++;
    }

    function parseArrivalStep(tk, current_node_id = 0){
        let tproc_transition_duration = app.sampleNodeTransitionDuration(current_node_id, 'tproc');
        let tso_transition_duration = app.sampleNodeTransitionDuration(current_node_id, 'tso');
        let next_node_id = app.sampleNextNodeId(current_node_id);

        let last_arrival_obj = tk.arrivals.slice(-1)[0];

        last_arrival_obj.transition_duration = tproc_transition_duration;
        last_arrival_obj.effort_duration = tso_transition_duration;
        last_arrival_obj.departure_time = last_arrival_obj.arrival_time + tproc_transition_duration;

        if(next_node_id){
            tk.arrivals.push({
                node_id: next_node_id, 
                arrival_time: last_arrival_obj.departure_time, 
                transition_duration: 0,
                effort_duration: 0,
                departure_time: 0
            })
            parseArrivalStep(tk, next_node_id);
        }
    }

    tokens.forEach(function(tk){
        let current_tk = tk; 
        parseArrivalStep(current_tk, 0);
    });

    return tokens;
}




function updateCharts(cdata) {
    try {
        var trace = {
            x: cdata,
            type: 'histogram',
        };
        var data = [trace];
        Plotly.react('chart1', data);
    } catch{
        console.log('no node selected')
    }
}

setInterval(function () {
    try {
        let selected_node_id = d3.select(app.selected_node).data()[0].id;
        let cdata = app.flow_data.nodes.filter(nd => nd.id == selected_node_id)[0].logs.transition_durations;
        updateCharts(cdata);
    } catch{

    }
}, 1000)

window.onload = function () {
    update()
}

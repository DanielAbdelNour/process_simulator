Vue.component('barchart', {
    props: ['node_data'],
    data(){
        return{
            init:0
        }
    },
    template: `<div id='chart2-chart'>
    </div>`,
    watch: {
        node_data: {
            deep: true,
            handler(n, o) {
                this.updateChart()
            }
        }
    },
    mounted() {
        this.updateChart()
    },
    methods: {
        updateChart: function () {
            //debugger;
            let node_names = this.node_data.map(nd => nd.name);
            let total_efforts = this.node_data.map(nd => nd.logs.operator_efforts).map(s => math.sum(s));

            //1) combine the arrays:
            var list = [];
            for (var j = 0; j < node_names.length; j++)
                list.push({ 'name': node_names[j], 'value': total_efforts[j] });

            //2) sort:
            list.sort(function (a, b) {
                return a.value < b.value ? -1 : 1;
            });

            //3) separate them back out:
            for (var k = 0; k < list.length; k++) {
                node_names[k] = list[k].name;
                total_efforts[k] = list[k].value;
            }

            let total_efforts_sum = d3.sum(total_efforts);
            let total_efforts_percent = total_efforts.map(x => x/total_efforts_sum);

            var data = [
                {
                    y: node_names,
                    x: total_efforts_percent,
                    type: 'bar',
                    orientation: 'h'
                }
            ];
            var layout = {
                autosize: true,
                margin: {
                    t: 15,
                    l: 150
                }
            };

            Plotly.react('chart2-chart', data, layout);
        }
    }
})

Vue.component('value-box', {
    props: ['box_title', 'box_value'],
    template: `<div class="value-box">
    <div class="value-box-value">
        <div>
            {{box_value}}
        </div>
    </div>
    <div class="value-box-title">
        <div>
            {{box_title}}
        </div>
    </div>
</div>`
})

Vue.component('path-tag', {
    props: ['tag_title', 'tag_count', 'tag_transition_mean', 'tag_effort_mean'],
    template: `<div class="top-paths-tag">
    <div class="top-paths-title">
        <p>
            {{tag_title.slice(0, 50)}}
        </p>
    </div>
    <div class="top-paths-trans">
        <p title='avg process time (days)'>
            {{seq_transition_mean_fixed}}
        </p>
    </div>
    <div class="top-paths-effort">
        <p title='avg effort (mins)'>
            {{seq_effort_mean_fixed}}
        </p>
    </div>
    <div class="top-paths-cnt">
        <p title='count'>
            {{tag_count}}
        </p>
    </div>
</div>`,
    computed: {
        seq_transition_mean_fixed: function () {
            let nout = 0;
            try {
                nout = this.tag_transition_mean.toFixed(2);
            } catch{
                nout = 0;
            }
            return nout;
        },
        seq_effort_mean_fixed: function () {
            let nout = 0;
            try {
                nout = this.tag_effort_mean.toFixed(2);
            } catch{
                nout = 0;
            }
            return nout;
        }
    }
})

var app = new Vue({
    el: '#app',
    data: {
        scene_control_type:'simulation',
        n_sim_tokens:200,
        sim_seconds:60*1000,
        chart2_type: 'total_processing',
        heatmap: false,
        heatmap_mode: 'process time',
        model_name: 'my_model',
        show_modal: false,
        selected_node: null,
        selected_link: null,
        selected_seq: null,
        flow_data: {
            simulation_time: 0,
            generated_token_ids: [],
            system_backlog_history: [],
            token_data: [],
            nodes: [{
                id: 0,
                name: "nd0",
                x: 20,
                y: 260,
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
                // log of node activity
                // nnow = number of tokens being processed right now
                // ntotal = total number of tokens that have passed through the node
                logs: {
                    nnow: 0,
                    nwaiting: 0,
                    ntotal: 0,
                    avg_tproc: 0,
                    transition_durations: [],
                    operator_efforts: [],
                    backlog_history: []
                }
            }],
            links: [
                // {
                //     id: 0,
                //     name: "li0",
                //     path_prob: 0,
                //     source: 0,
                //     target: 0
                // }
            ]
        }
    },
    computed: {        
        all_node_nodes: function () {
            return document.querySelectorAll('.node');
        },
        avg_backlog: function () {
            let avg = 0;
            if (this.selected_node) {
                // the mean of the last N entries
                let backlog_hist = d3.select(this.selected_node).data()[0].logs.backlog_history;
                if (backlog_hist.length > 0) {
                    avg = math.mean(backlog_hist.slice(backlog_hist.length - 100, backlog_hist.length));
                }
            } else {
                let backlog_hist = this.flow_data.system_backlog_history;
                if (backlog_hist.length > 0) {
                    avg = math.median(math.mode(backlog_hist));
                }
            }
            return avg;
        },
        avg_process_time: function () {
            let avg = 0;
            if (this.selected_node) {
                let transition_times = d3.select(this.selected_node).data()[0].logs.transition_durations;
                if (transition_times.length > 0) {
                    avg = math.mean(transition_times);
                }
            } else if(this.selected_seq){              
                let transition_times = this.getProcMetrics(this.selected_seq);
                if(transition_times.length > 0){
                    avg = d3.mean(transition_times);
                }
            } else {
                let transition_times = effort = this.flow_data.token_data.map(t => t.node_transition_duration_history.map(v => v.time)).map(b => d3.sum(b));
                if (transition_times.length > 0) {
                    avg = d3.mean(transition_times);
                }
            }
            return avg
        },
        avg_effort: function () {
            let avg = 0;
            if (this.selected_node) {
                let effort = d3.select(this.selected_node).data()[0].logs.operator_efforts;
                if (effort.length > 0) {
                    avg = math.mean(effort);
                }
            }else if(this.selected_seq){
                let effort = this.getSeqMetrics(this.selected_seq);
                if(effort.length > 0){
                    avg = d3.mean(effort);
                }
            } else {
                let effort = this.flow_data.token_data.map(t => t.node_operator_effort_history.map(v => v.time)).map(b => d3.sum(b));
                if (effort.length > 0) {
                     avg = d3.mean(effort);
                }
            }
            return avg
        },
        flow_data_node_stats: function () {
            return this.flow_data.nodes.map(nd => nd.logs)
        },
        flow_data_node_nnow: function () {
            let stats = this.flow_data_node_stats
            return stats.map(st => st.nnow)
        },
        avg_proc_time: function () {
            let avg_tproc = d3.mean(this.flow_data_node_stats.map(i => i.transition_durations).flat())
            if (avg_tproc) {
                return avg_tproc.toFixed(2)
            } else {
                return 0
            }
        },
        avg_so_time: function () {
            let avg_tso = d3.mean(this.flow_data_node_stats.map(i => i.operator_efforts).flat())
            if (avg_tso) {
                return avg_tso.toFixed(2)
            } else {
                return 0
            }
        }
    },
    methods: {
        setHeatmap() {
            let mode = this.heatmap_mode;
            let log_type = 'transition_durations';

            if (mode == 'process time') {
                log_type = 'transition_durations';
            } else if (mode == 'effort') {
                log_type = 'operator_efforts';
            } else if (mode == 'backlog') {
                log_type = 'backlog_history';
            }

            if (this.heatmap) {
                try {
                    let all_nodes = document.querySelectorAll('.node');
                    let max_tproc = math.max(this.flow_data.nodes.map(nd => math.sum(nd.logs[log_type])).flat());
                    all_nodes.forEach(function (z) {
                        z.classList.remove('node-passive');
                        let nid = Number.parseInt(z.id.replace('nd', ''));
                        let tproc = this.flow_data.nodes.filter(x => x.id == nid)[0].logs[log_type];
                        let mean_tproc = math.sum(tproc);
                        let scaled_tproc = math.log1p(mean_tproc) / math.log1p(max_tproc);
                        let rval = scaled_tproc ? 70 + (scaled_tproc * (255 - 70)) : 70;
                        z.style.fill = 'rgb(' + rval + ',100,100)';
                    }.bind(this))
                } catch (e) {
                    console.log(e)
                }
            } else {
                try {
                    let all_nodes = document.querySelectorAll('.node');
                    all_nodes.forEach(function (z) {
                        z.classList.add('node-passive');
                        z.style.fill = '';
                    })
                } catch (e) {
                    console.log(e)
                }
            }
        },
        getSeqMetrics(seq_names){
            let tk_seqs = this.flow_data.token_data.map(ng => ng.node_history.map(nn => nn.name)).map(fg => fg.join());
            let tk_efforts = this.flow_data.token_data.map(ng => ng.node_operator_effort_history.map(zz => zz.time)).map(as => d3.sum(as));
            let seq_efforts = [];
            for(var i = 0; i < tk_seqs.length; i++){
                let newobj = {seq:tk_seqs[i], total_effort:tk_efforts[i]}
                seq_efforts.push(newobj);
            }
            let selected_effort_metric = seq_efforts.filter(sq => sq.seq == this.selected_seq).map(vq => vq.total_effort);
            return selected_effort_metric;
        },
        getProcMetrics(seq_names){
            let tk_seqs = this.flow_data.token_data.map(ng => ng.node_history.map(nn => nn.name)).map(fg => fg.join());
            let tk_efforts = this.flow_data.token_data.map(ng => ng.node_transition_duration_history.map(zz => zz.time)).map(as => d3.sum(as));
            let seq_efforts = [];
            for(var i = 0; i < tk_seqs.length; i++){
                let newobj = {seq:tk_seqs[i], total_effort:tk_efforts[i]}
                seq_efforts.push(newobj);
            }
            let selected_effort_metric = seq_efforts.filter(sq => sq.seq == this.selected_seq).map(vq => vq.total_effort);
            return selected_effort_metric;
        },
        getNodeHistory(selected_node, top_n = 10) {
            let tk_node_hist_ids = this.flow_data.token_data.map((tk) => tk.node_history).map((h) => h.map((v => v.id)));
            let tk_node_hist_names = this.flow_data.token_data.map((tk) => tk.node_history).map((h) => h.map((v => v.name)));

            // ANCHOR transition duration calcs
            let tk_node_transition_data = this.flow_data.token_data
                .map((tk) => tk.node_transition_duration_history)
                .map(zz => zz.map(ff => ({ name: this.getNodeName(ff.id), time: ff.time })));
            let tk_node_transition_durations = tk_node_transition_data.map(xz => xz.map(sz => sz.time));
            let tk_node_transition_names = tk_node_transition_data.map(xz => xz.map(sz => sz.name)).map(er => er.join());
            let process_duration_seqs = []
            for (var i = 0; i < tk_node_transition_names.length; i++) {
                process_duration_seqs.push({ seq_name: tk_node_transition_names[i], seq_durations: tk_node_transition_durations[i] })
            }

            // ANCHOR effort time calcs
            let tk_node_effort_data = this.flow_data.token_data
                .map((tk) => tk.node_operator_effort_history)
                .map(zz => zz.map(ff => ({ name: this.getNodeName(ff.id), time: ff.time })));
            let tk_node_operator_efforts = tk_node_effort_data.map(xz => xz.map(sz => sz.time));
            let tk_node_effort_transition_names = tk_node_effort_data.map(xz => xz.map(sz => sz.name)).map(er => er.join());
            let operator_effort_seqs = []
            for (var i = 0; i < tk_node_effort_transition_names.length; i++) {
                operator_effort_seqs.push({ seq_name: tk_node_effort_transition_names[i], seq_durations: tk_node_operator_efforts[i] })
            }


            // TODO switch out calculation algorithm for this one
            // let seq_efforts = Object.values(operator_effort_seqs.reduce(function(total, current_value, current_index){
            //     if(total[current_value.seq_name]){
            //         ++total[current_value.seq_name].count;
            //         total[current_value.seq_name].metric.push(current_value.seq_durations);
            //     }else{
            //         total[current_value.seq_name] = {seq_name:current_value.seq_name, count:1, metric:[current_value.seq_durations]}
            //     }
            //     return total
            // }, {}));
            // let seq_total_efforts = seq_efforts.map(sq => sq.metric.map(ff => d3.sum(ff))).map(qq => d3.mean(qq));



            // generate distinct sequence counts by creating a new item for every distinct sequence
            // then calculating metrics on thay individual sequence group
            var result = tk_node_hist_names.reduce(function (r, o, i) {
                let nn = o.join();
                let ii = tk_node_hist_ids[i].join();

                let dd = process_duration_seqs.filter(x => x.seq_name == nn).map(v => {
                    return v.seq_durations;
                }).flat();
                let mean_transition_time = dd.length > 0 ? d3.mean(dd) : 0;;

                let cc = operator_effort_seqs.filter(x => x.seq_name == nn).map(v => {
                    return v.seq_durations;
                }).flat();
                let mean_effort_time = cc.length > 0 ? d3.mean(cc) : 0;;

                if (r[nn]) {
                    ++r[nn].count;
                    r[nn].seq_transition_mean = mean_transition_time;
                    r[nn].seq_effort_mean = mean_effort_time;
                } else {
                    r[nn] = { seq: nn, seq_id: ii, count: 1, seq_transition_mean: mean_transition_time, seq_effort_mean: mean_effort_time };
                }
                return r;
            }, {});

            let result_list = Object.values(result).sort((a, b) => (a.count < b.count ? 1 : -1));

            return result_list.slice(0, 10);
        },
        selectTagSequence(i) {
            // highlight sequence nodes
            this.selected_node = null;
            let all_node_ids = this.flow_data.nodes.map(nn => nn.id);
            let all_node_nodes = document.querySelectorAll(all_node_ids.map(nn => '#nd' + nn));
            all_node_nodes.forEach(nn => nn.classList.remove('highlighted'));

            let node_names = this.getNodeHistory()[i].seq_id.split(',');
            let node_ids = node_names.map((nd) => Number.parseInt(nd));
            let node_nodes = document.querySelectorAll(node_names.map(nn => '#nd' + nn));
            node_nodes.forEach(nn => nn.classList.add('highlighted'));


            // highlight sequence links
            let all_link_ids = this.flow_data.links.map(li => li.id);
            let all_link_nodes = document.querySelectorAll(all_link_ids.map(nn => '#li' + nn));
            all_link_nodes.forEach(nn => nn.classList.remove('highlighted-link'));

            //let p1 = this.flow_data.links.filter(li => node_ids.includes(li.source) && node_ids.includes(li.target));
            //let p2 = p1.filter(li => node_ids.includes(li.target));

            let node_pairs = node_ids.map((nd, i) => node_ids.slice(i, i + 2)).filter(np => np.length > 1);
            let p2 = [];
            node_pairs.forEach(function (n, i) {
                let links = this.flow_data.links.filter(li => li.source == n[0] && li.target == n[1])[0];
                p2.push(links);
            }.bind(this));

            let link_node_ids = p2.map((li) => '#li' + li.id);
            let link_nodes = document.querySelectorAll(link_node_ids);

            link_nodes.forEach(li => li.classList.add('highlighted-link'));
            this.selected_seq = this.getNodeHistory()[i].seq;
        },
        getNodeName(id) {
            return this.flow_data.nodes.filter(x => x.id == id)[0].name;
        },
        saveFile(arr, filename) {
            const data = JSON.stringify(arr);
            const blob = new Blob([data], { type: 'text/plain' });
            const e = document.createEvent('MouseEvents');
            a = document.createElement('a');
            a.download = filename + ".json";
            a.href = window.URL.createObjectURL(blob);
            a.dataset.downloadurl = ['text/json', a.download, a.href].join(':');
            e.initEvent('click', true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
            a.dispatchEvent(e);
        },
        saveSimulation(model_name) {
            // write flowdata to disk
            this.saveFile(this.flow_data, model_name);

        },
        loadSimulation() {
            let par = this;
            var input = document.createElement('input');
            input.type = 'file';
            input.onchange = e => {
                var file = e.target.files[0];

                var reader = new FileReader();
                reader.readAsText(file, 'UTF-8');

                // here we tell the reader what to do when it's done reading...
                reader.onload = readerEvent => {
                    var content = readerEvent.target.result; // this is the content!    
                    var content_json = JSON.parse(content);
                    par.flow_data = content_json;
                    window.update();
                }
            }
            input.click();
        },
        changeDist() {
            //debugger;
            // let selected_node = d3.select(this.selected_node).data()[0];
            // let new_dist = d3.select(this.selected_node).data()[0].pdef.tproc_dist.name;
            // this.flow_data.nodes.filter(i => i == i.selected_node.id).pdef.tproc_dist.name = new_dist;
        },
        // ANCHOR get the possible nodes that flow out of the source node
        sampleNextNodeId(node_id){
            let current_node_links = this.flow_data.links.filter(li => li.source == node_id);
            let next_node_candidates = current_node_links.map(li => ({target: li.target, path_prob: Number.parseFloat(li.path_prob)}));
            let next_node_id = null;
            if(next_node_candidates.length > 0){
                next_node_id = chance.weighted(next_node_candidates.map(ll => ll.target) , next_node_candidates.map(ll => ll.path_prob));
            }
            return next_node_id;
        },
        // ANCHOR sample processing/effort time from node
        sampleNodeTransitionDuration(node_id=0, transition_type='tproc'){
            let node_details = this.flow_data.nodes.filter(nd => nd.id == node_id)[0];
            let transition_duration = 0;

            if(transition_type == 'tproc'){
                let node_dist_name = node_details.pdef.tproc_dist.name;
                let node_dist_param1 = node_details.pdef.tproc_dist.parameter1;
                let node_dist_param2 = node_details.pdef.tproc_dist.parameter2;
                transition_duration = jStat[node_dist_name].sample(node_dist_param1, 1)
            }else if(transition_type == 'tso'){
                let node_dist_name = node_details.pdef.tso_dist.name;
                let node_dist_param1 = node_details.pdef.tso_dist.parameter1;
                let node_dist_param2 = node_details.pdef.tso_dist.parameter2;
                transition_duration = jStat[node_dist_name].sample(node_dist_param1, 1)
            }
            return transition_duration;
        },
        onNodeSelected: function () {

        },
        vUpdate: function () {

        },
        newNode: function () {

        }
    },
    watch: {
        flow_data_node_nnow: function (val, old_val) {

        }
    }
});


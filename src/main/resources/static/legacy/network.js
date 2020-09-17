define("plugin/commitgraph/network", [
    'jquery',
    'plugin/commitgraph/commit-collection',
    'plugin/commitgraph/graph-segment'
], function($, CommitCollection, GraphSegment) {
    function Network() {
        this.bodyWidth = 0;
        this.segments = [];
        
        this.cellHeight = this.getTrHeight();
        this.collection = new CommitCollection();

        this.init(); 
    }
    
    _.extend(Network.prototype , {
        init : function(){
            var me = this;

            this.hideLinks();
            this.getCommits();

            this.initInfiniteScroll();

            $(window).resize(function() {
                me.onZoom();
            });            
            $(window).on('commit-graph-row-hover-start', function(e, commitId){
                me.onHoverStart(commitId);
            })
            $(window).on('commit-graph-row-hover-stop', function(e, commitId){
                me.onHoverStop(commitId);
            })
        },
        onHoverStart : function(commitId){
            var $row = $('.commits-table tbody tr[data-commitid=' + commitId + ']')
            $row.addClass('selected');
        },
        onHoverStop : function(commitId){
            var $row = $('.commits-table tbody tr[data-commitid=' + commitId + ']')
            $row.removeClass('selected');
        },
        onZoom : function() {
            var me = this,
                height = me.getTrHeight();

            if (this.cellHeight !== height){
                this.cellHeight = height;

                _.each(this.segments, function(segment) {
                    segment.updateHeight(height);
                });
            }
        },
        getTrHeight : function() {
            //it's required to support zoom and it means coordinates can be float
            var $rows = $('.commits-table tbody tr.commit-row'),
                pos = $rows.length > 1 ? 1 : 0,
                height = $rows.get(pos).getBoundingClientRect().height;
            return height;
        },
        applyCommits : function(commits) {
            // Create a new graph container for this round of commits
            var $container = $('<div class="graph-segment"></div>').appendTo('.commit-graph .graph-body');
            
            $container.wrap('<div class="wrap-stopper"></div>');

            var firstItem = (this.collection.nodes.length === 0),
                segmentData = this.collection.registerAndReturnGraphSegmentData(commits);

            var segment = new GraphSegment($container, segmentData, {
                yStep: this.cellHeight,
                paddingLeft: 5,
                firstItem : firstItem,
                dotRadius: 4,
                lineWidth: 2,
                showLabels : true,
                animateDots : true
            } );
            
            this.segments.push(segment);
        },
        getCommits : function() {
            var json = $('commitgraph-javascript:last').text();
            var commits = JSON.parse(json);
            
            if (commits.length){
                this.applyCommits(commits);
            }
        },
        hideLinks : function() {
            $('tr.infinitescroll-nav').hide();
            var $nextLink = $('a.scroll-next:last');
            // Change the next links href to include "contentsOnly=true"
            // which only returns a small amount of data.
            $nextLink.attr('href', $nextLink.attr('href') + '&contentsOnly=true');
        },
        initInfiniteScroll : function(){
            var me = this,
                $scroller = $('tbody.infinitescroll'),
                $loader = $('.commitgraph-loading-indicator').spin('large').hide();

            $scroller.infinitescroll({
                navSelector: 'tr.infinitescroll-nav',
                nextSelector: 'a.scroll-next:last',
                itemSelector: 'tr',
                loading: {
                    start: function() {
                        $loader.show();
                        var $this = $(this).data('infinitescroll');
                        $this.beginAjax($this.options);
                    },
                    finished: function() {
                        $loader.hide();
                    }
                },
                errorCallback: function() {
                    $loader.spinStop().children().remove();
                    $loader.html('No more history');
                    $scroller.infinitescroll('pause');
                }
            }, function(newCommits) {
                me.hideLinks();
                me.getCommits();
            });
            
        }
        
    });
    return Network;
});

AJS.$(function(){
    var Network = require("plugin/commitgraph/network");
    
    new Network();
});


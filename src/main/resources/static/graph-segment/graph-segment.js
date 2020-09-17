define('plugin/commitgraph/graph-segment', [
    'jquery',
    'underscore',
    'bitbucket/util/navbuilder'
], function($, _, navbuilder) {
    var LABEL_COLOR = 'rgba(51, 51, 51, 80)',
        TEXT_PADDING = 3, LR_PADDING = 3, TRIANGLE_MARGIN = 3,
        MAX_LABEL_SIZE = 100;

    
    function GraphSegment($el, data, options){
        var defaults = {
            paddingTop: 0,
            paddingLeft: 0,
            yStep: 20,
            xStep: 15,
            dotRadius: 3,
            lineWidth: 2
        };
        this.$el = $el;
        this.options = _.extend({}, defaults, options);
        this.data = data;
        this.buildGraph();
        
    }
    _.extend(GraphSegment.prototype, {
        buildGraph : function() {
            var self = this,
                deepestBranch = this.getDeepestBranch();

            this.width = (deepestBranch + 1) * (this.options.xStep + this.options.lineWidth) + (this.options.paddingLeft * 2) + this.options.dotRadius;

            this.height = this.data.length * this.options.yStep;
            // If the last commit has parents (isn't an initial commit) extend the svg by
            // another half cell.
            if (this.data[this.data.length - 1].commitParents > 0) {
                this.height += (this.options.yStep / 2);
            }
            this.paper = Raphael(this.$el[0], this.width, this.height);
            this.calculatedWidth = this.width;
            
            if (!this.options.firstItem) {
                //$(this.paper.canvas).css({'margin-top' : - this.options.yStep / 2});
                this.$el.parent().css({'margin-top' : - this.options.yStep / 2});
            }
            
            this.objects = this.paper.set();

            $.each(this.data, function(i, point) {
                var routes = self.drawRoutes(point, i);
                $.each(routes, function(i, route) { self.objects.push(route); });
                self.objects.push(self.drawDot(point, i));
                if (self.options.showLabels) {
                    self.objects.push(self.drawLabels(point, i));
                }
                
            });
            var shifted = false;
            
            //if labels don't fit initial width
            if (this.calculatedWidth > this.width) {
                this.width += this.calculatedWidth;
                this.paper.setSize(this.width, this.height);
                shifted = true;
            } 

            this.objects.forEach(function(item){this.alignObjects(item, shifted)}, this); 
        },
        alignObjects : function(item, shifted) {
            
            var dx = this.calculatedWidth;

            if (item.type!=='set'){
                shifted && item.transform(['T', dx, 0]);
            } else {
                var rect;
                item.forEach(function(labelItem){
                   if  (labelItem.type === 'rect'){
                       rect = labelItem;
                       rect.toFront();
                       return false;
                   }
                });

                item.forEach(function(labelItem, idx){
                    if (labelItem.type !== 'text') {
                        shifted && labelItem.transform(['T', dx, 0]);
                    } else {
                        var labelDx = shifted ? dx + rect.getBBox().x : rect.getBBox().x;

                        if (idx === 1) { labelDx += TEXT_PADDING + LR_PADDING; }

                        labelItem.transform(['T', labelDx, 0]);
                        labelItem.toFront();
                    }
                }, this);
            }
            
        },
        cleanGraph : function() {
            this.$el.empty();
        },
        drawDot : function(point, yStep) {
            var me = this,
                branches = (point.branches === undefined) ? undefined : point.branches.join(', '),
                tags = (point.tags === undefined) ? undefined : point.tags.join(', '),
                title = _.filter([branches, tags], function(item){return !!item}).join(', '),
                dot = this.paper
                .circle(this.getXPos(point.dotOffset), this.getYPos(yStep) + this.options.yStep/2, this.options.dotRadius)
                .attr({
                    fill: this.getColor(point.dotColor),
                    'stroke-width': 0,
                    cursor: 'pointer'
                });

            dot.hover(function() {
                $(window).trigger('commit-graph-row-hover-start', [point.commitId]);
                if (me.options.animateDots) {
                    if (!dot.originalTransform) {
                        dot.originalTransform = dot.transform().toString();
                    }
                    dot.animate({ transform: dot.originalTransform + ' S 1.5 1.5' }, 50);
                }
            }, function() {
                $(window).trigger('commit-graph-row-hover-stop', [point.commitId]);
                if (me.options.animateDots) {
                    dot.animate({ transform: dot.originalTransform +' S 1 1' }, 50);
                }
            });
            
            if (point.commitHref) {
                dot.click(function() {
                    window.open(point.commitHref);
                });
            }
            

            if(title){
                var $dot = $(dot[0]);

                $dot.attr("title", title); 
                $dot.tipsy();
                
            }
            
            return dot;
        },
        drawRoutes : function(point, yStep) {
            // Loop over the routes in reverse so the
            // lines lay on top of each other properly.
            var quarterXStep = this.options.xStep / 4;
            var twoThirdYStep = this.options.yStep / 3 * 2;
            var fromY = this.getYPos(yStep) + this.options.yStep/2 - 1; //start a bit early to avoid gaps (GRAPH-15)
            var toY = this.getYPos(yStep + 1) + (point.commitParents.length === 0 ? 0 : this.options.yStep/2); //last item
            var routes = [];

            for (var i = point.routes.length - 1; i >= 0; i--) {
                var route = point.routes[i];
                var fromX = this.getXPos(route.from);
                var toX = this.getXPos(route.to);
                var pathOptions = { stroke: this.getColor(route.color), 'stroke-width': this.options.lineWidth };
                var moveArr = ['M', fromX, fromY];

                var path = null;
                if (fromX === toX) {
                    path = this.paper.path(['M', fromX, fromY].concat(['L', toX, toY]))
                    .attr(pathOptions);
                } else {
                    path = this.paper.path(
                        ['M', fromX, fromY].concat( 
                        ['C', fromX - quarterXStep, fromY + twoThirdYStep,
                            toX + quarterXStep, toY - twoThirdYStep,
                            toX, toY]))
                                .attr(pathOptions);
                }
                routes.push(path);
            }
            return routes;
        },
        drawLabels : function(point, yStep) {
            if (!point.branches && !point.tags){
                return;
            }
            
            var triSize = 10; //heigth
            var semiTriSize = triSize / 3 * 2; //this is width actually

            var xPos = this.getXPos(point.dotOffset) - this.options.dotRadius - TRIANGLE_MARGIN;
            var yPos = this.getYPos(yStep) + this.options.yStep/2;
            var names = [] ;

            function collectNames(item){
                names.push(item);
            }

            _.find(point.branches, collectNames);
            _.find(point.tags, collectNames);
            

            this.paper.setStart();
            

            var triXPos = xPos - semiTriSize,
                textAttrs = { fill: '#FFF', font: '11px monospace', 'text-anchor': 'start', title : names.join(', ')},
                labelAttrs = $.extend({ cursor: 'pointer' }, textAttrs),
                tagAttrs = $.extend({}, labelAttrs, { 'font-style': 'italic', fill: '#FFB' }),
                branchAttrs = $.extend({}, labelAttrs, { fill: '#BFB' }),
                otherAttrs = $.extend({}, textAttrs, { 'font-style': 'italic' }), //TODO
                labelLen = (point.branches ? point.branches.length : 0) + (point.tags ? point.tags.length : 0),
                startX = 0,
                textHeight = 0,
                position = 0;
            
            this.paper.setStart();
            
            // Draw tooltip triangle
            this.paper.path([
                'M', triXPos, yPos - (triSize / 2),
                'L', xPos, yPos,
                'L', triXPos, yPos + (triSize / 2),
                'L', triXPos, yPos - triSize
            ]).attr({ fill: LABEL_COLOR, stroke: 'none' });
            
            function drawLabel(attrs, name){
                var text = this.paper.text(startX, yPos, name).attr(attrs);
                startX += text.getBBox().width;
                textHeight = text.getBBox().height;
                text._label = name;

                text.click(function() { 
                    var browseUrl = navbuilder.currentRepo().browse().at(this._label).build();
                    window.open(browseUrl); 
                });

                if (startX > MAX_LABEL_SIZE){
                    var otherCnt = labelLen - 1 - position;
                    if (otherCnt){
                        var othersText = ' and others(' + otherCnt + ')',
                            others = this.paper.text(startX, yPos, othersText).attr(otherAttrs);

                        startX += others.getBBox().width;

                    }
                    
                    return true;
                }                
                

                if (position < labelLen - 1) {
                    var comma = this.paper.text(startX, yPos, ', ').attr(textAttrs);
                    startX += comma.getBBox().width;
                }
                position++;
            };

            _.find(point.branches, _.bind(drawLabel, this, branchAttrs));
            _.find(point.tags, _.bind(drawLabel, this, tagAttrs));
            

            // Draw the label box

            this.paper.rect(triXPos - startX - TEXT_PADDING * 2 -  LR_PADDING* 2,
                    yPos - (textHeight / 2) - TEXT_PADDING,
                    startX + TEXT_PADDING * 2 +  LR_PADDING * 2,
                    textHeight + TEXT_PADDING * 2)
                .attr({ fill: LABEL_COLOR, stroke: 'none', title : names.join(', ')});
           
            var maybeNewWidth = startX + TEXT_PADDING * 2 + LR_PADDING * 2 + this.options.dotRadius * 2;
            
            if (maybeNewWidth > this.calculatedWidth) {
                this.calculatedWidth = maybeNewWidth;
            }

            var label = this.paper.setFinish();
           
            return label;
        },        
        getYPos : function(level) {
            return (this.options.yStep * level) + this.options.paddingTop;
        },
        getXPos : function(branch) {
            return this.width - (this.options.xStep * branch) - this.options.paddingLeft - this.options.dotRadius; 
        },
        getColor : function(branch) {
            return this.colors[branch % this.colors.length];
        },
        updateHeight : function(yStep) {
            this.options.yStep = yStep;
            this.cleanGraph();
            this.buildGraph();
        },
        getDeepestBranch : function() {
            // To find the width we can loop and find the deepest branch.
            var deepestBranch = 0;
            $.each(this.data, function(i, point) {
                if (point.dotOffset > deepestBranch) deepestBranch = point.dotOffset;

                $.each(point.routes, function(j, route) {
                    if (route.from > deepestBranch) deepestBranch = route.from;
                    if (route.to > deepestBranch) deepestBranch = route.to;
                });
                
            });
            return deepestBranch;
        },
        colors : [
            "#e11d21", "#fbca04", "#5319e7", "#cc317c", "#207de5",
            "#0052cc", "#009800", "#486EB6", "#ECDA42", "#CF2027",
            "#77C258", "#A5C33B", "#783695", "#DB7928", "#54958C",
            "#83421B", "#84b6eb", "#7F7F7F", "#006b75"
        ]
        
    });
    
    return GraphSegment;
});
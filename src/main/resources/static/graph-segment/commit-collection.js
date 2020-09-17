define('plugin/commitgraph/commit-collection', [
    'jquery',
    'underscore'
], function($, _) {
    function CommitCollection(){
        // A way of caching all commits requested and helps to speed up 
        // raphael rendering performance.
        this.nodes = [];
        this.lineIdCnt = 0;
        this.reserve = [];
        this.orphaned = [];
        this.lines = { }; //maps sha to line id
        this.tags = {};
        this.branches = {};
        this.childrenMap = {};
    }
    
    _.extend(CommitCollection.prototype, {
        getOrRegisterLine : function (sha) {
            if (!this.lines.hasOwnProperty(sha)) {
                this.lines[sha] = this.lineIdCnt;
                this.reserve.push(this.lineIdCnt++);
            }
            return this.lines[sha];
        },
        addRoute : function (routes, fromOffset, toOffset, lineId ){
            if (this.orphaned.indexOf(lineId) === -1) {
                routes.push({ from: fromOffset, to: toOffset, color: lineId });
            }

        },
        addRefs : function(collection, map, propName){
            _.forEach(collection, function(item) {
                var hash = item[propName],
                    items = (map[hash] === undefined) ? [] : map[hash];

                items.push(item.displayId);
                
                map[hash] = items;
            });
        },
        addTags : function(tags) {
            this.addRefs(tags, this.tags, 'latestCommit');
        },
        addBranches : function(branches) {
            this.addRefs(branches, this.branches, 'latestCommit');
        },
        // Determine the different branches(lanes) for each commits and
        // how to draw the lines between them.
        registerAndReturnGraphSegmentData : function(commits) {
            var me = this,
                commitLen = commits.length,
                oldLen = this.nodes.length;
        
            for (var i = 0; i < commitLen; i++) {
                var commit = commits[i];
                var lineId = this.getOrRegisterLine(commit.id);
                var offset = this.reserve.indexOf(lineId);
                
                //some implementations may provide labels
                _.each(commit.labels, function(item){
                   if (item.type === "BRANCH") {
                       var items = me.branches[commit.id] || [];
                       items.push(item.name);
                       me.branches[commit.id] = items;
                   } else if (item.type === "TAG") {
                       var items = me.tags[commit.id] || [];
                       items.push(item.name);
                       me.tags[commit.id] = items;
                   }
                });

                var parentCnt = commit.parents.length;

                var routes = [];

                if (parentCnt > 0) {
                    var firstParentSha = commit.parents[0].id;
                    
                    if (!this.lines.hasOwnProperty(firstParentSha)) {

                        // Haven't seen its parent yet, continue straight
                        for (var j = 0; j < this.reserve.length; j++)
                            this.addRoute(routes, j, j, this.reserve[j]);

                        this.lines[firstParentSha] = lineId; //register commit parent to the same line
                    } else { // Seen its parent before

                        //shift lines from right 
                        for (var j = offset + 1; j < this.reserve.length; j++)
                            this.addRoute(routes, j, j - 1, this.reserve[j]);

                        for (var j = 0; j < offset; j++)
                            this.addRoute(routes, j, j, this.reserve[j]);

                        //remove reserve and draw the diverge point
                        this.reserve.splice(this.reserve.indexOf(lineId), 1);
                        this.addRoute(routes, offset, this.reserve.indexOf(this.lines[firstParentSha]), lineId);
                    }
                    if (parentCnt === 2) { // A merge commit: start rendering extra line
                        var otherLineId = this.getOrRegisterLine(commit.parents[1].id);
                        this.addRoute(routes, offset, this.reserve.indexOf(otherLineId), otherLineId);
                    }

                } else {
                    //register orphaned line
                    this.orphaned.push(lineId);
                    //continue to draw other lines
                    for (var j = 0; j < this.reserve.length; j++){
                        this.addRoute(routes, j, j, this.reserve[j]);
                    }
                }
                _.each(commit.parents, function(parent){
                    me.childrenMap[parent.id] = true;
                });
                
                this.nodes.push({
                    commitId: commit.id,
                    commitHref: commit.href,
                    hasChildren : !!me.childrenMap[commit.id],
                    commitParents: commit.parents.length,
                    dotOffset: offset,
                    dotColor: lineId,
                    routes: routes,
                    branches: this.branches[commit.id],
                    tags: this.tags[commit.id]
                });
            }
            return _.clone(this.nodes.slice(oldLen, this.nodes.length));
        }
    });
    return CommitCollection;
});

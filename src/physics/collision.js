/*
 * MelonJS Game Engine
 * Copyright (C) 2011 - 2014 Olivier Biot, Jason Oster, Aaron McLeod
 * http://www.melonjs.org
 *
 * Separating Axis Theorem implementation, based on the SAT.js library by Jim Riecken <jimr@jimr.ca>
 * Available under the MIT License - https://github.com/jriecken/sat-js
 */

(function () {

    /**
     * Constants for Vornoi regions
     * @ignore
     */
    var LEFT_VORNOI_REGION = -1;

    /**
     * Constants for Vornoi regions
     * @ignore
     */
    var MIDDLE_VORNOI_REGION = 0;

    /**
     * Constants for Vornoi regions
     * @ignore
     */
    var RIGHT_VORNOI_REGION = 1;


    /**
     * A pool of `Vector` objects that are used in calculations to avoid allocating memory.
     * @type {Array.<Vector>}
     */
    var T_VECTORS = [];
    for (var v = 0; v < 10; v++) { T_VECTORS.push(new me.Vector2d()); }

    /**
     * A pool of arrays of numbers used in calculations to avoid allocating memory.
     * @type {Array.<Array.<number>>}
     */
    var T_ARRAYS = [];
    for (var a = 0; a < 5; a++) { T_ARRAYS.push([]); }


    /**
     * Flattens the specified array of points onto a unit vector axis,
     * resulting in a one dimensional range of the minimum and
     * maximum value on that axis.
     * @param {Array.<Vector>} points The points to flatten.
     * @param {Vector} normal The unit vector axis to flatten on.
     * @param {Array.<number>} result An array.  After calling this function,
     *   result[0] will be the minimum value,
     *   result[1] will be the maximum value.
     */
    function flattenPointsOn(points, normal, result) {
        var min = Number.MAX_VALUE;
        var max = -Number.MAX_VALUE;
        var len = points.length;
        for (var i = 0; i < len; i++) {
            // The magnitude of the projection of the point onto the normal
            var dot = points[i].dotProduct(normal);
            if (dot < min) { min = dot; }
            if (dot > max) { max = dot; }
        }
        result[0] = min;
        result[1] = max;
    }

    /**
     * Check whether two convex polygons are separated by the specified
     * axis (must be a unit vector).
     * @param {Vector} aPos The position of the first polygon.
     * @param {Vector} bPos The position of the second polygon.
     * @param {Array.<Vector>} aPoints The points in the first polygon.
     * @param {Array.<Vector>} bPoints The points in the second polygon.
     * @param {Vector} axis The axis (unit sized) to test against.  The points of both polygons
     *   will be projected onto this axis.
     * @param {Response=} response A Response object (optional) which will be populated
     *   if the axis is not a separating axis.
     * @return {boolean} true if it is a separating axis, false otherwise.  If false,
     *   and a response is passed in, information about how much overlap and
     *   the direction of the overlap will be populated.
     */
    function isSeparatingAxis(aPos, bPos, aPoints, bPoints, axis, response) {
        var rangeA = T_ARRAYS.pop();
        var rangeB = T_ARRAYS.pop();
        // The magnitude of the offset between the two polygons
        var offsetV = T_VECTORS.pop().copy(bPos).sub(aPos);
        var projectedOffset = offsetV.dotProduct(axis);

        // Project the polygons onto the axis.
        flattenPointsOn(aPoints, axis, rangeA);
        flattenPointsOn(bPoints, axis, rangeB);
        // Move B's range to its position relative to A.
        rangeB[0] += projectedOffset;
        rangeB[1] += projectedOffset;
        // Check if there is a gap. If there is, this is a separating axis and we can stop
        if (rangeA[0] > rangeB[1] || rangeB[0] > rangeA[1]) {
            T_VECTORS.push(offsetV);
            T_ARRAYS.push(rangeA);
            T_ARRAYS.push(rangeB);
            return true;
        }

        // This is not a separating axis. If we're calculating a response, calculate the overlap.
        if (response) {
            var overlap = 0;
            // A starts further left than B
            if (rangeA[0] < rangeB[0]) {
                response.aInB = false;
                // A ends before B does. We have to pull A out of B
                if (rangeA[1] < rangeB[1]) {
                    overlap = rangeA[1] - rangeB[0];
                    response.bInA = false;
                // B is fully inside A.  Pick the shortest way out.
                } else {
                    var option1 = rangeA[1] - rangeB[0];
                    var option2 = rangeB[1] - rangeA[0];
                    overlap = option1 < option2 ? option1 : -option2;
                }
            // B starts further left than A
            } else {
                response.bInA = false;
                // B ends before A ends. We have to push A out of B
                if (rangeA[1] > rangeB[1]) {
                    overlap = rangeA[0] - rangeB[1];
                    response.aInB = false;
                // A is fully inside B.  Pick the shortest way out.
                } else {
                    var option11 = rangeA[1] - rangeB[0];
                    var option22 = rangeB[1] - rangeA[0];
                    overlap = option11 < option22 ? option11 : -option22;
                }
            }

            // If this is the smallest amount of overlap we've seen so far, set it as the minimum overlap.
            var absOverlap = Math.abs(overlap);
            if (absOverlap < response.overlap) {
                response.overlap = absOverlap;
                response.overlapN.copy(axis);
                if (overlap < 0) {
                    response.overlapN.reverse();
                }
            }
        }
        T_VECTORS.push(offsetV);
        T_ARRAYS.push(rangeA);
        T_ARRAYS.push(rangeB);
        return false;
    }


    /**
     * Calculates which Vornoi region a point is on a line segment. <br>
     * It is assumed that both the line and the point are relative to `(0,0)`<br>
     * <br>
     *             |       (0)      |<br>
     *      (-1)  [S]--------------[E]  (1)<br>
     *             |       (0)      |<br>
     *
     * @ignore
     * @param {Vector} line The line segment.
     * @param {Vector} point The point.
     * @return  {number} LEFT_VORNOI_REGION (-1) if it is the left region,
     *          MIDDLE_VORNOI_REGION (0) if it is the middle region,
     *          RIGHT_VORNOI_REGION (1) if it is the right region.
     */
    function vornoiRegion(line, point) {
        var len2 = line.length2();
        var dp = point.dotProduct(line);
        if (dp < 0) {
            // If the point is beyond the start of the line, it is in the
            // left vornoi region.
            return LEFT_VORNOI_REGION;
        } else if (dp > len2) {
            // If the point is beyond the end of the line, it is in the
            // right vornoi region.
            return RIGHT_VORNOI_REGION;
        } else {
            // Otherwise, it's in the middle one.
            return MIDDLE_VORNOI_REGION;
        }
    }

    /**
     * A singleton for managing collision detection (and projection-based collision response) of 2D shapes.<br>
     * Based on the Separating Axis Theorem and supports detecting collisions between simple Axis-Aligned Boxes, convex polygons and circles based shapes.
     * @namespace
     * @property {Singleton} collision
     * @memberOf me
     */
    me.collision = (function () {
        // hold public stuff in our singleton
        var api = {};

        /*
         * PUBLIC STUFF
         */

        /**
         * the world quadtree used for the collision broadphase
         * @name quadTree
         * @memberOf me.collision
         * @public
         * @type {me.QuadTree}
         */
        api.quadTree = null;

        /**
         * The maximum number of levels that the quadtree will create. Default is 4.
         * @name maxDepth
         * @memberOf me.collision
         * @public
         * @type {number}
         * @see me.collision.quadTree
         * 
         */
        api.maxDepth = 4;

        /**
         * The maximum number of children that a quadtree node can contain before it is split into sub-nodes. Default is 8.
         * @name maxChildren
         * @memberOf me.collision
         * @public
         * @type {boolean}
         * @see me.collision.quadTree
         */
        api.maxChildren = 8;
        
       /**
         * bounds of the physic world.
         * @name bounds
         * @memberOf me.collision
         * @public
         * @type {me.Rect}
         */
        api.bounds = null;

        /**
         * Enum for collision type values. <br>
         * Possible values are : <br>
         * - <b>`NO_OBJECT`</b> (to disable collision check) <br>
         * - <b>`PLAYER_OBJECT`</b> <br>
         * - <b>`NPC_OBJECT`</b> <br>
         * - <b>`ENEMY_OBJECT`</b> <br>
         * - <b>`COLLECTABLE_OBJECT`</b> <br>
         * - <b>`ACTION_OBJECT`</b> <br>
         * - <b>`PROJECTILE_OBJECT`</b> <br>
         * - <b>`WORLD_SHAPE`</b> (for collision check with collision shapes/tiles) <br>
         * - <b>`ALL_OBJECT`</b> <br>
         * @readonly
         * @enum {number}
         * @name types
         * @memberOf me.collision
         * @see me.body.setCollisionMask
         * @see me.body.collisionType
         * @example
         * // set the entity body collision type
         * myEntity.body.setCollisionType = me.collision.types.PLAYER_OBJECT;
         * // filter collision detection with collision shapes, enemies and collectables
         * myEntity.body.setCollisionMask(me.collision.types.WORLD_SHAPE | me.collision.types.ENEMY_OBJECT | me.collision.types.COLLECTABLE_OBJECT);
         */
        api.types = {
            NO_OBJECT : 0,
            
            /**
             * Default object type constant for collision filtering
             * @constant
             * @name PLAYER_OBJECT
             * @memberOf me.collision.types
             */
            PLAYER_OBJECT : 1,

            /**
             * Default object type constant for collision filtering
             * @constant
             * @name NPC_OBJECT
             * @memberOf me.collision.types
             */
            NPC_OBJECT : 2,
            
            /**
             * Default object type constant for collision filtering
             * @constant
             * @name ENEMY_OBJECT
             * @memberOf me.collision.types
             */
            ENEMY_OBJECT : 4,

            /**
             * Default object type constant for collision filtering
             * @constant
             * @name COLLECTABLE_OBJECT
             * @memberOf me.collision.types
             */
            COLLECTABLE_OBJECT : 8,

            /**
             * Default object type constant for collision filtering
             * @constant
             * @name ACTION_OBJECT
             * @memberOf me.collision.types
             */
            ACTION_OBJECT : 16, // door, etc...

            /**
             * Default object type constant for collision filtering
             * @constant
             * @name PROJECTILE_OBJECT
             * @memberOf me.collision.types
             */
            PROJECTILE_OBJECT : 32, // missiles, etc...

            /**
             * Default object type constant for collision filtering
             * @constant
             * @name WORLD_SHAPE
             * @memberOf me.collision.types
             */
            WORLD_SHAPE : 64, // walls, etc...

            /**
             * Default object type constant for collision filtering
             * @constant
             * @name ALL_OBJECT
             * @memberOf me.collision.types
             */
            ALL_OBJECT : 0xFFFFFFFF // all objects
        };

        /** 
         * Initialize the collision/physic world
         * @ignore
         */
        api.init = function () {
            // default bounds to the game viewport
            api.bounds = me.game.viewport.clone();
            // initializa the quadtree
            api.quadTree = new me.QuadTree(api.bounds, api.maxChildren, api.maxDepth);
            
            // reset the collision detection engine if a TMX level is loaded
            me.event.subscribe(me.event.LEVEL_LOADED, function () {
                // default bounds to game world
                me.collision.bounds = me.game.world.clone();
                // reset the quadtree
                me.collision.quadTree.clear(me.collision.bounds);
            });
        };
        
        /**
         * An object representing the result of an intersection, contains: <br>
         *  - <b>`a`</b> and <b>`b`</b> {me.Entity} : The two objects participating in the intersection <br>
         *  - <b>`overlap`</b> {number} : Magnitude of the overlap on the shortest colliding axis. <br>
         *  - <b>`overlapV`</b> {me.vector2d}: The overlap vector (i.e. `overlapN.scale(overlap, overlap)`). If this vector is subtracted from the position of a, a and b will no longer be colliding <br>
         *  - <b>`overlapN`</b> {me.vector2d}: The shortest colliding axis (unit-vector) <br>
         *  - <b>`aInB`</b>, <b>`bInA`</b> {boolean} : Whether the first object is entirely inside the second, and vice versa. <br>
         *  - <b>`indexShapeA</b> {number} : the index of the colliding shape for the object a body. <br>
         *  - <b>`indexShapeB</b> {number} : the index of the colliding shape for the object b body. <br>
         *  - <b>`clear()`</b> {function} :  Set some values of the response back to their defaults. Call this between tests if you are going to reuse a single Response object for multiple intersection tests <br>
         * @name ResponseObject
         * @memberOf me.collision
         * @public
         * @type {external:Object}
         * @see me.collision.check
         */
        api.ResponseObject = function () {
            this.a = null;
            this.b = null;
            this.overlapN = new me.Vector2d();
            this.overlapV = new me.Vector2d();
            this.aInB = true;
            this.bInA = true;
            this.indexShapeA = -1;
            this.indexShapeB = -1;
            this.overlap = Number.MAX_VALUE;
        };

        /**
         * Set some values of the response back to their defaults. <br>
         * Call this between tests if you are going to reuse a single <br>
         * Response object for multiple intersection tests <br>
         * (recommended as it will avoid allocating extra memory) <br>
         * @name clear
         * @memberOf me.collision.ResponseObject
         * @public
         * @function
         */
        api.ResponseObject.prototype.clear = function () {
            this.aInB = true;
            this.bInA = true;
            this.overlap = Number.MAX_VALUE;
            this.indexShapeA = -1;
            this.indexShapeB = -1;
            return this;
        };

        /**
         * a global instance of a response object used for collision detection <br>
         * this object will be reused amongst collision detection call if not user-defined response is specified
         * @name response
         * @memberOf me.collision
         * @public
         * @type {me.collision.ResponseObject}
         */
        api.response = new api.ResponseObject();

        /**
         * a callback used to determine if two objects should collide (based on both respective objects collision mask and type).<br>
         * you can redefine this function if you need any specific rules over what should collide with what.
         * @name shouldCollide
         * @memberOf me.collision
         * @public
         * @function
         * @param {me.Entity} a a reference to the object A.
         * @param {me.Entity} b a reference to the object B.
         * @return {Boolean} true if they should collide, false otherwise
         */
        api.shouldCollide = function (a, b) {
            return (
                a.body && b.body &&
                (a.body.collisionMask & b.body.collisionType) !== 0 &&
                (a.body.collisionType & b.body.collisionMask) !== 0
            );
        };
        
        /**
         * Checks if the specified entity collides with others entities 
         * @name check
         * @memberOf me.collision
         * @public
         * @function
         * @param {me.Entity} obj entity to be tested for collision
         * @param {me.collision.ResponseObject} [respObj=me.collision.response] a user defined response object that will be populated if they intersect.
         * @return {Boolean} in case of collision, false otherwise
         * @example
         * update : function (dt) {
         *    ...
         *    // check for collision between this object and all others
         *    me.collision.check(this);
         *    ...
         * };
         *
         * onCollision : function (response) {
         *     if (response.b.body.collisionType === me.collision.types.ENEMY_OBJECT) {
         *         // makes the other entity solid, by substracting the overlap vector to the current position
         *         this.pos.sub(response.overlapV);
         *         this.hurt();
         *     } else {
         *         ...
         *     }
         * };
         */
        api.check = function (objA, responseObject) {
            var collision = 0;
            var response = responseObject || api.response;
            
            // retreive a list of potential colliding objects            
            var candidates = api.quadTree.retrieve(objA);
            
            for (var i = candidates.length, objB; i--, (objB = candidates[i]);) {

                if (objB.inViewport || objB.alwaysUpdate) {

                    // check if both objects "should" collide
                    if ((objB !== objA) && api.shouldCollide(objA, objB)) {

                        // fast AABB check if both bounding boxes are overlaping
                        if (objA.getBounds().overlaps(objB.getBounds())) {

                            // go trough all defined shapes in A
                            var indexA = 0;
                            do {
                                var shapeA = objA.body.getShape(indexA);
                                // go through all defined shapes in B
                                var indexB = 0;
                                do {
                                    var shapeB = objB.body.getShape(indexB);

                                    // full SAT collision check
                                    if (api["test" + shapeA.shapeType + shapeB.shapeType]
                                        .call(
                                            this,
                                            objA, // a reference to the object A
                                            shapeA,
                                            objB,  // a reference to the object B
                                            shapeB,
                                             // clear response object before reusing
                                            response.clear()) === true
                                    ) {
                                        // we touched something !
                                        collision++;
                                        
                                        // set the shape index
                                        response.indexShapeA = indexA;
                                        response.indexShapeB = indexB;

                                        // execute the onCollision callback
                                        if (objA.onCollision(response, objB) !== false) {
                                            objA.body.respondToCollision.call(objA.body, response);
                                        }
                                        if (objB.onCollision(response, objA) !== false) {
                                            objB.body.respondToCollision.call(objB.body, response);
                                        }
                                    }
                                    indexB++;
                                } while (indexB < objB.body.shapes.length);
                                indexA++;
                            } while (indexA < objA.body.shapes.length);
                        }
                    }
                }
            }
            // we could return the amount of objects we collided with ?
            return collision > 0;
        };

        /**
         * Checks whether polygons collide.
         * @ignore
         * @param {me.Entity} a a reference to the object A.
         * @param {me.Polygon} polyA a reference to the object A Polygon to be tested
         * @param {me.Entity} b a reference to the object B.
         * @param {me.Polygon} polyB a reference to the object B Polygon to be tested
         * @param {Response=} response Response object (optional) that will be populated if they intersect.
         * @return {boolean} true if they intersect, false if they don't.
         */
        api.testPolygonPolygon = function (a, polyA, b, polyB, response) {
            // specific point for
            var aPoints = polyA.points;
            var aNormals = polyA.normals;
            var aLen = aNormals.length;
            var bPoints = polyB.points;
            var bNormals = polyB.normals;
            var bLen = bNormals.length;
            // aboslute shape position
            var posA = T_VECTORS.pop().copy(a.pos).add(polyA.pos);
            var posB = T_VECTORS.pop().copy(b.pos).add(polyB.pos);
            var i;

            // If any of the edge normals of A is a separating axis, no intersection.
            for (i = 0; i < aLen; i++) {
                if (isSeparatingAxis(posA, posB, aPoints, bPoints, aNormals[i], response)) {
                    T_VECTORS.push(posA);
                    T_VECTORS.push(posB);
                    return false;
                }
            }

            // If any of the edge normals of B is a separating axis, no intersection.
            for (i = 0;i < bLen; i++) {
                if (isSeparatingAxis(posA, posB, aPoints, bPoints, bNormals[i], response)) {
                    T_VECTORS.push(posA);
                    T_VECTORS.push(posB);
                    return false;
                }
            }

            // Since none of the edge normals of A or B are a separating axis, there is an intersection
            // and we've already calculated the smallest overlap (in isSeparatingAxis).  Calculate the
            // final overlap vector.
            if (response) {
                response.a = a;
                response.b = b;
                response.overlapV.copy(response.overlapN).scale(response.overlap);
            }
            T_VECTORS.push(posA);
            T_VECTORS.push(posB);
            return true;
        };

        /**
         * Check if two Ellipse collide.
         * @ignore
         * @param {me.Entity} a a reference to the object A.
         * @param {me.Ellipse} ellipseA a reference to the object A Ellipse to be tested
         * @param {me.Entity} b a reference to the object B.
         * @param {me.Ellipse} ellipseB a reference to the object B Ellipse to be tested
         * @param {Response=} response Response object (optional) that will be populated if
         *   the circles intersect.
         * @return {boolean} true if the circles intersect, false if they don't.
         */
        api.testEllipseEllipse = function (a, ellipseA, b, ellipseB, response) {
            // Check if the distance between the centers of the two
            // circles is greater than their combined radius.
            var differenceV = T_VECTORS.pop().copy(b.pos).add(ellipseB.pos).sub(a.pos).add(ellipseA.pos);
            var radiusA = ellipseA.radius;
            var radiusB = ellipseB.radius;
            var totalRadius = radiusA + radiusB;
            var totalRadiusSq = totalRadius * totalRadius;
            var distanceSq = differenceV.length2();
            // If the distance is bigger than the combined radius, they don't intersect.
            if (distanceSq > totalRadiusSq) {
                T_VECTORS.push(differenceV);
                return false;
            }
            // They intersect.  If we're calculating a response, calculate the overlap.
            if (response) {
                var dist = Math.sqrt(distanceSq);
                response.a = a;
                response.b = b;
                response.overlap = totalRadius - dist;
                response.overlapN.copy(differenceV.normalize());
                response.overlapV.copy(differenceV).scale(response.overlap);
                response.aInB = radiusA <= radiusB && dist <= radiusB - radiusA;
                response.bInA = radiusB <= radiusA && dist <= radiusA - radiusB;
            }
            T_VECTORS.push(differenceV);
            return true;
        };

        /**
         * Check if a polygon and an ellipse collide.
         * @ignore
         * @param {me.Entity} a a reference to the object A.
         * @param {me.Polygon} polyA a reference to the object A Polygon to be tested
         * @param {me.Entity} b a reference to the object B.
         * @param {me.Ellipse} ellipseB a reference to the object B Ellipse to be tested
         * @param {Response=} response Response object (optional) that will be populated if they intersect.
         * @return {boolean} true if they intersect, false if they don't.
         */
        api.testPolygonEllipse = function (a, polyA, b, ellipseB, response) {
            // Get the position of the circle relative to the polygon.
            var circlePos = T_VECTORS.pop().copy(b.pos).add(ellipseB.pos).sub(a.pos).add(polyA.pos);
            var radius = ellipseB.radius;
            var radius2 = radius * radius;
            var points = polyA.points;
            var edges = polyA.edges;
            var len = edges.length;
            var edge = T_VECTORS.pop();
            var normal = T_VECTORS.pop();
            var point = T_VECTORS.pop();
            var dist = 0;

            // For each edge in the polygon:
            for (var i = 0; i < len; i++) {
                var next = i === len - 1 ? 0 : i + 1;
                var prev = i === 0 ? len - 1 : i - 1;
                var overlap = 0;
                var overlapN = null;

                // Get the edge.
                edge.copy(edges[i]);
                // Calculate the center of the circle relative to the starting point of the edge.
                point.copy(circlePos).sub(points[i]);

                // If the distance between the center of the circle and the point
                // is bigger than the radius, the polygon is definitely not fully in
                // the circle.
                if (response && point.length2() > radius2) {
                    response.aInB = false;
                }

                // Calculate which Vornoi region the center of the circle is in.
                var region = vornoiRegion(edge, point);
                // If it's the left region:
                if (region === LEFT_VORNOI_REGION) {
                    // We need to make sure we're in the RIGHT_VORNOI_REGION of the previous edge.
                    edge.copy(edges[prev]);
                    // Calculate the center of the circle relative the starting point of the previous edge
                    var point2 = T_VECTORS.pop().copy(circlePos).sub(points[prev]);
                    region = vornoiRegion(edge, point2);
                    if (region === RIGHT_VORNOI_REGION) {
                        // It's in the region we want.  Check if the circle intersects the point.
                        dist = point.length();
                        if (dist > radius) {
                            // No intersection
                            T_VECTORS.push(circlePos);
                            T_VECTORS.push(edge);
                            T_VECTORS.push(point);
                            T_VECTORS.push(point2);
                            return false;
                        } else if (response) {
                            // It intersects, calculate the overlap.
                            response.bInA = false;
                            overlapN = point.normalize();
                            overlap = radius - dist;
                        }
                    }
                    T_VECTORS.push(point2);
                    // If it's the right region:
                } else if (region === RIGHT_VORNOI_REGION) {
                    // We need to make sure we're in the left region on the next edge
                    edge.copy(edges[next]);
                    // Calculate the center of the circle relative to the starting point of the next edge.
                    point.copy(circlePos).sub(points[next]);
                    region = vornoiRegion(edge, point);
                    if (region === LEFT_VORNOI_REGION) {
                        // It's in the region we want.  Check if the circle intersects the point.
                        dist = point.length();
                        if (dist > radius) {
                            // No intersection
                            T_VECTORS.push(circlePos);
                            T_VECTORS.push(edge);
                            T_VECTORS.push(point);
                            return false;
                        } else if (response) {
                            // It intersects, calculate the overlap.
                            response.bInA = false;
                            overlapN = point.normalize();
                            overlap = radius - dist;
                        }
                    }
                // Otherwise, it's the middle region:
                } else {
                    // Need to check if the circle is intersecting the edge,
                    // Get the normal.
                    normal.copy(polyA.normals[i]);
                    // Find the perpendicular distance between the center of the
                    // circle and the edge.
                    dist = point.dotProduct(normal);
                    var distAbs = Math.abs(dist);
                    // If the circle is on the outside of the edge, there is no intersection.
                    if (dist > 0 && distAbs > radius) {
                        // No intersection
                        T_VECTORS.push(circlePos);
                        T_VECTORS.push(normal);
                        T_VECTORS.push(point);
                        return false;
                    } else if (response) {
                        // It intersects, calculate the overlap.
                        overlapN = normal;
                        overlap = radius - dist;
                        // If the center of the circle is on the outside of the edge, or part of the
                        // circle is on the outside, the circle is not fully inside the polygon.
                        if (dist >= 0 || overlap < 2 * radius) {
                            response.bInA = false;
                        }
                    }
                }

                // If this is the smallest overlap we've seen, keep it.
                // (overlapN may be null if the circle was in the wrong Vornoi region).
                if (overlapN && response && Math.abs(overlap) < Math.abs(response.overlap)) {
                    response.overlap = overlap;
                    response.overlapN.copy(overlapN);
                }
            }

            // Calculate the final overlap vector - based on the smallest overlap.
            if (response) {
                response.a = a;
                response.b = b;
                response.overlapV.copy(response.overlapN).scale(response.overlap);
            }
            T_VECTORS.push(circlePos);
            T_VECTORS.push(edge);
            T_VECTORS.push(normal);
            T_VECTORS.push(point);
            return true;
        };

        /**
         * Check if an ellipse and a polygon collide. <br>
         * **NOTE:** This is slightly less efficient than testPolygonEllipse as it just
         * runs testPolygonEllipse and reverses the response at the end.
         * @ignore
         * @param {me.Entity} a a reference to the object A.
         * @param {me.Ellipse} ellipseA a reference to the object A Ellipse to be tested
         * @param {me.Entity} a a reference to the object B.
         * @param {me.Polygon} polyB a reference to the object B Polygon to be tested
         * @param {Response=} response Response object (optional) that will be populated if
         *   they intersect.
         * @return {boolean} true if they intersect, false if they don't.
         */
        api.testEllipsePolygon = function (a, ellipseA, b, polyB, response) {
            // Test the polygon against the circle.
            var result = api.testPolygonEllipse(b, polyB, a, ellipseA, response);
            if (result && response) {
                // Swap A and B in the response.
                var resa = response.a;
                var aInB = response.aInB;
                response.overlapN.reverse();
                response.overlapV.reverse();
                response.a = response.b;
                response.b = resa;
                response.aInB = response.bInA;
                response.bInA = aInB;
            }
            return result;
        };

        // return our object
        return api;
    })();
})();

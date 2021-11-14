"use strict";

function Seat(id, data, overlay, parentDiv) {

    this.id = id;
    this.data = data;
    this.overlay = overlay;

    this.__select = false;
    this.__transformOrigin = false;

    this.listeners = new Utils.Listeners(['change'],true);
    this.on = this.listeners.on.bind(this.listeners);

    this._createDiv(parentDiv);
}

Seat.CONFIG = {

    spriteSize: 48,

    newNamePrefix: "NEW_",
    newSidPrefix: "DUMMY_",
    DELETED: "DELETED",

    unchangedOffset: "0px",
    changedOffset: "-96px",
    newSeatOffset: "-144px",
    disabledOffset: "-288px",

}

Seat.prototype.silentSetXY = function(x,y) {

    x = Math.round(x);
    y = Math.round(y);

    if (this.data.x == x)
        delete this.overlay['x'];
    else
        this.overlay['x'] = x;

    if (this.data.y == y)
        delete this.overlay['y'];
    else
        this.overlay['y'] = y;

    this._updateDiv();

}

Seat.prototype.isNew = function() {
    return this.id.startsWith(Seat.CONFIG.newSidPrefix);
}

Seat.prototype._destroy = function() {

    this.seatDiv.parentNode.removeChild(this.seatDiv);
    Object.keys(this.overlay).forEach((e) => delete this.overlay[e]);
}

Seat.prototype._updateData = function(data) {

    this.data = data;
    Object.keys(this.overlay).forEach((e) => delete this.overlay[e]);
    this._updateDiv();
}

Seat.prototype._createDiv = function(parentDiv) {

    this.seatDiv = document.createElement("div");

    this.seatDiv.style.position = "absolute";
    this.seatDiv.style.width = Seat.CONFIG.spriteSize + "px";
    this.seatDiv.style.height = Seat.CONFIG.spriteSize + "px";
    this.seatDiv.style.backgroundImage = 'url('+window.warpGlobals.URLs['seatSprite']+')';

    this._updateDiv();
    parentDiv.appendChild(this.seatDiv);
}

Seat.prototype._updateDiv = function() {

    this.seatDiv.style.left = this.x + "px";
    this.seatDiv.style.top = this.y + "px";

    let offset = Seat.CONFIG.unchangedOffset;
    if (this.isNew())
        offset = Seat.CONFIG.newSeatOffset;
    else if (this.deleted)
        offset = Seat.CONFIG.disabledOffset;
    else if (Object.keys(this.overlay).length > 0)
        offset = Seat.CONFIG.changedOffset;

    this.seatDiv.style.backgroundPositionX = offset;

    if (this.__select)
        this.seatDiv.style.outline = "2px solid #b71c1c";
    else if (this.__transformOrigin)
        this.seatDiv.style.outline = "2px solid #1b5e20";
    else
        this.seatDiv.style.outline = "";
}

Object.defineProperty(Seat.prototype, "deleted", {
    get: function() {
        return Seat.CONFIG.DELETED in this.overlay;
    },
    set: function(v) {

        if (this.deleted == v)
            return;

        if (v)
            this.overlay[Seat.CONFIG.DELETED] = true;
        else
            delete this.overlay[Seat.CONFIG.DELETED];

        this._updateDiv();
        this.listeners.fireEvent('change',this,this);
    }
});


Object.defineProperty(Seat.prototype, "select", {
    get: function() {
        return this.__select;
    },
    set: function(v) {
        if (this.__select != v) {
            this.__select = v;
            this._updateDiv();
        }
    }
});

Object.defineProperty(Seat.prototype, "transformOrigin", {
    get: function() {
        return this.__transformOrigin;
    },
    set: function(v) {
        if (this.__transformOrigin != v) {
            this.__transformOrigin = v;
            this._updateDiv();
        }
    }
});

Seat._getterFactory = function(propName) {
    return function() {
        if (propName in this.overlay)
            return this.overlay[propName];
        else
            return this.data[propName];
    }
}

Seat._setterFactory = function(propName,mutator = a => a) {
    return function(value) {

        if (this.data[propName] === mutator(value) && propName in this.overlay) {
                delete this.overlay[propName];
        }
        else if (this.overlay[propName] !== mutator(value)) {
            this.overlay[propName] = mutator(value);
        }
        else
            return;

        this._updateDiv();
        this.listeners.fireEvent('change',this,this);
    }
}

Object.defineProperty(Seat.prototype, "name", { get: Seat._getterFactory('name'), set: Seat._setterFactory('name') } );
Object.defineProperty(Seat.prototype, "x", { get: Seat._getterFactory('x'), set: Seat._setterFactory('x',parseInt) } );
Object.defineProperty(Seat.prototype, "y", { get: Seat._getterFactory('y'), set: Seat._setterFactory('y',parseInt) } );

function SeatFactory(url,parentDiv,zoneMapImg) {

    this.url = url;
    this.parentDiv = parentDiv;
    this.zoneMapImg = zoneMapImg;
    this.instances = {};
    this.overlay = {};

    this.newSeatCounter = 1;

    this.selectedSeat = null;
    this.drag = {
        state: false,
        offsetX: 0,
        offsetY: 0,
    };

    this.endTransform(false); // initialize this.transfer structure

    this.listeners = new Utils.Listeners(['select','unselect','drag','change']);
    this.on = this.listeners.on.bind(this.listeners);

    this.parentDiv.addEventListener("mouseout", this._zoneMouseOut.bind(this));
    this.parentDiv.addEventListener("mousemove", this._zoneMouseMove.bind(this));
    this.parentDiv.addEventListener("mousedown", this._zoneMouseDown.bind(this));
}

SeatFactory.prototype._resetState = function() {

    this.drag.state = false;

    if (this.selectedSeat) {
        let s = this.selectedSeat;
        this.selectedSeat.select = false;
        this.selectedSeat = null;

        this.listeners.fireEvent('unselect',this,s);
    }
}

SeatFactory.prototype.updateData = function() {

    this._resetState();

    Utils.xhr(this.url,null,false,true,undefined,"GET")
    .then( (v) => {

        let oldIds = new Set( Object.keys(this.instances));
        let newData = v.response;

        for (let sid in newData) {
            if (!oldIds.delete(sid)) {
                this._createSeat(sid,newData[sid]);
            }
            else {
                this.instances[sid]._updateData(newData[sid]);
            }
        }

        for (var sid of oldIds) {
            this.instances[sid]._destroy();
            delete this.instances[sid];
            delete this.overlay[sid];
        }

        this.listeners.fireEvent('change',this,null);
    });
}

SeatFactory.prototype.isChanged = function() {

    for (let i in this.overlay) {
        if (Object.keys(this.overlay[i]).length > 0)
            return true;
    }

    return false;
}

SeatFactory.prototype.getChanges = function() {

    let res = {
        addOrUpdate: [],
        remove: []
    };

    for (let sid in this.overlay) {

        let value = this.overlay[sid]

        if (Object.keys(value).length == 0)
            continue;

        if (sid.startsWith(Seat.CONFIG.newSidPrefix)) {
            if (Seat.CONFIG.DELETED in value) {//this should not happen
                console.error("Deleted in artificial seat");
                continue;
            }
            res.addOrUpdate.push( Object.assign({},value));
        }
        else if (Seat.CONFIG.DELETED in value) {
            res.remove.push(parseInt(sid));
        }
        else {
            res.addOrUpdate.push( Object.assign({sid: parseInt(sid)},value));
        }
    }

    if (res.addOrUpdate.length == 0)
        delete res.addOrUpdate;
    if (res.remove.length == 0)
        delete res.remove;

    return res;
}


SeatFactory.prototype.createNewSeat = function(name,x,y) {

    let newSid = this.newSeatCounter++;

    name = name || Seat.CONFIG.newNamePrefix + newSid;
    newSid = Seat.CONFIG.newSidPrefix + newSid;

    if (newSid in this.instances)
        throw Error("Something is very wrong.")

    this.overlay[newSid] = {
        name: name,
        x: x - Seat.CONFIG.spriteSize/2,
        y: y - Seat.CONFIG.spriteSize/2,
    };

    let seat = this._createSeat(newSid,{});

    this._resetState();
    this.selectedSeat = seat;
    this.selectedSeat.select = true;
    this.listeners.fireEvent('select',this,seat);
    this.listeners.fireEvent('change',this,seat);
}

SeatFactory.prototype.deleteRestoreSeat = function(seat) {

    if (seat == null)
        return;

    if (seat.deleted) {
        seat.deleted = false;
    }
    else {

        let sid = seat.id;

        if (sid.startsWith(Seat.CONFIG.newSidPrefix)) {

            if (this.transform.state && this.transform.originSeat == seat)
                throw Error("Cannot delete origin seat");

            seat._destroy();
            delete this.instances[sid];
            delete this.overlay[sid];

            if (this.selectedSeat == seat)
                this._resetState();

            this.listeners.fireEvent('change',this,seat);
        }
        else {
            seat.deleted = true;
        }
    }
}

SeatFactory.prototype.getSelectedSeat = function() {
    return this.selectedSeat;
}

SeatFactory.prototype.transformState = function() {
    return this.transform.state;
}

SeatFactory.prototype.beginTransform = function() {

    if (this.transform.state)
        throw Error("Already in transform state");

    if (!this.selectedSeat)
        throw Error("A seat must be selected.");

    if (this.selectedSeat.isNew())
        throw Error("New seats cannot be transformed.");

    this.transform.state = true;
    this.transform.originSeat = this.selectedSeat;
    this.transform.originSeatInitial.x = this.transform.originSeat.x;
    this.transform.originSeatInitial.y = this.transform.originSeat.y;
    this.transform.originOffset.x = this.transform.originOffset.y = 0;
    this.transform.initialValues = {};
    for (let s in this.instances) {
        if (!this.instances[s].isNew())
            this.transform.initialValues[s] = {
                x: this.instances[s].x,
                y: this.instances[s].y
            }
    }
    this.transform.originSeat.transformOrigin = true;
}

SeatFactory.prototype.endTransform = function(cancel = false) {

    if (this.transform && this.transform.state) {
        if (cancel) {
            for (let s in this.transform.initialValues) {
                this.instances[s].silentSetXY(
                    this.transform.initialValues[s].x,
                    this.transform.initialValues[s].y
                )
            }
        }
        this.transform.originSeat.transformOrigin = false;
    }

    this.transform = {
        state: false,
        originSeat: null,
        originSeatInitial: { x:0, y:0 },    //just to speed up
        originOffset: { x: 0, y:0 },
        initialValues: {},
    };

}


SeatFactory.prototype._transform = function(seat) {

    if (!this.transform.state || seat.isNew())
        return;

    if (this.transform.originSeat == seat) {
        // move
        let newOffset = {
            x: seat.x - this.transform.originSeatInitial.x,
            y: seat.y - this.transform.originSeatInitial.y,
        };

        for (let sid in this.instances) {

            let trSeat = this.instances[sid];
            if (trSeat == seat)
                continue;

            let r = {
                x: trSeat.x + newOffset.x - this.transform.originOffset.x,
                y: trSeat.y + newOffset.y - this.transform.originOffset.y,
            }

            trSeat.silentSetXY(r.x,r.y);
        }

        this.transform.originOffset = newOffset;
    }
    else {

        let seatInitial = {
            x: this.transform.initialValues[seat.id].x,
            y: this.transform.initialValues[seat.id].y
        };

        let a = {
            x: this.transform.originSeatInitial.x - seatInitial.x,
            y: this.transform.originSeatInitial.y - seatInitial.y,
        };
        let b = {
            x: this.transform.originSeat.x - seat.x,
            y: this.transform.originSeat.y - seat.y,
        };

        let magnASq = (a.x*a.x) + (a.y*a.y);
        let sCosTheta = (a.x * b.x + a.y * b.y) / magnASq;
        let sSinTheta = (a.x * b.y - a.y * b.x) / magnASq;

        let transfM = [
            sCosTheta, -sSinTheta,
            sSinTheta, sCosTheta,
        ];

        function matrixPointMult(M,x,y) {
            return {
                x: M[0] * x + M[1] * y,
                y: M[2] * x + M[3] * y
            };
        }

        for (let sid in this.transform.initialValues) {

            let trSeat = this.instances[sid];

            if (trSeat == this.transform.originSeat || trSeat == seat)
                continue;

            let r = matrixPointMult(
                transfM,
                this.transform.initialValues[sid].x-this.transform.originSeatInitial.x,
                this.transform.initialValues[sid].y-this.transform.originSeatInitial.y);

            r.x += this.transform.originSeatInitial.x + this.transform.originOffset.x;
            r.y += this.transform.originSeatInitial.y + this.transform.originOffset.y;

            if (r.x < 0)
                r.x = 0;
            if (r.y < 0)
                r.y = 0;

            trSeat.silentSetXY(r.x, r.y);
        }
    }
}

SeatFactory.prototype._seatOnChange = function(seat) {

    this._transform(seat);
    this.listeners.fireEvent('change',this,seat);
}

SeatFactory.prototype._seatMouseDown = function(seat,e) {

    if (this.selectedSeat) {
        this.selectedSeat.select = false;
        this.listeners.fireEvent('unselect',this.selectedSeat);
    }

    this.selectedSeat = seat;
    this.selectedSeat.select = true;

    this.drag.state = true;
    this.drag.offsetX = e.offsetX;
    this.drag.offsetY = e.offsetY;

    e.stopPropagation();

    this.listeners.fireEvent('select',this,seat);
}

SeatFactory.prototype._seatMouseUp = function(e) {
    this.drag.state = false;
}

SeatFactory.prototype._zoneMouseOut = function(e) {
    if (this.drag.state && !this.parentDiv.contains(e.relatedTarget))
        this.drag.state = false;
}

SeatFactory.prototype._zoneMouseDown = function(e) {
    if (this.selectedSeat) {
        let s = this.selectedSeat;
        this.selectedSeat.select = false;
        this.selectedSeat = null;
        this.listeners.fireEvent('unselect',this,s);
    }
}

SeatFactory.prototype._zoneMouseMove = function(e) {
    if (!this.drag.state)
        return;
    e.preventDefault();

    var rect = this.zoneMapImg.getBoundingClientRect();
    var x = e.clientX - rect.left; //x position within the element.
    var y = e.clientY - rect.top;  //y position within the element.

    this.selectedSeat.x = x-this.drag.offsetX;
    this.selectedSeat.y = y-this.drag.offsetY;

    this.listeners.fireEvent('drag',this,this.selectedSeat);
}

SeatFactory.prototype._createSeat = function(sid,data) {

    if (sid in this.instances)
        throw Error('id already exists');

    if (!(sid in this.overlay))
        this.overlay[sid] = {};

    let seat = new Seat(sid, data, this.overlay[sid], this.parentDiv);
    this.instances[sid] = seat;
    seat.on('change',this._seatOnChange.bind(this));

    let seatDiv = seat.seatDiv;
    seatDiv.addEventListener("mousedown", this._seatMouseDown.bind(this,seat));
    seatDiv.addEventListener("mouseup", this._seatMouseUp.bind(this));

    return seat;
}

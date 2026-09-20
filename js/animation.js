"use strict";

/*
=========================================================

 SkyReader Animation Engine

 Responsibilities

 • Timeline scheduler
 • requestAnimationFrame loop
 • Animation queue
 • Easing
 • Shared timing engine

=========================================================
*/

window.Animation=(function(){

const animation={};

/*-------------------------------------------------------
  Constants
-------------------------------------------------------*/

const FPS=60;

const FRAME_TIME=1000/FPS;

/*-------------------------------------------------------
  State
-------------------------------------------------------*/

let running=false;

let rafId=0;

let lastFrame=0;

const queue=[];

/*-------------------------------------------------------
  Timeline Class
-------------------------------------------------------*/

class Timeline{

constructor(options={}){

this.duration=options.duration||300;

this.delay=options.delay||0;

this.elapsed=0;

this.started=false;

this.finished=false;

this.cancelled=false;

this.onStart=options.onStart||null;

this.onUpdate=options.onUpdate||null;

this.onComplete=options.onComplete||null;

this.ease=options.ease||Easing.ease;

}

start(){

this.started=true;

this.elapsed=0;

if(typeof this.onStart==="function"){

this.onStart();

}

}

update(delta){

if(this.finished)return;

if(this.cancelled)return;

if(!this.started){

this.start();

}

this.elapsed+=delta;

if(this.elapsed<this.delay){

return;

}

const progress=Math.min(

1,

(this.elapsed-this.delay)/this.duration

);

const value=this.ease(progress);

if(typeof this.onUpdate==="function"){

this.onUpdate(

value,

progress

);

}

if(progress>=1){

this.finished=true;

if(typeof this.onComplete==="function"){

this.onComplete();

}

}

}

cancel(){

this.cancelled=true;

}

}

/*-------------------------------------------------------
  Easing
-------------------------------------------------------*/

const Easing={

linear(t){

return t;

},

ease(t){

return t*t*(3-2*t);

},

easeIn(t){

return t*t;

},

easeOut(t){

return 1-Math.pow(

1-t,

2

);

},

easeInOut(t){

return t<0.5

?

2*t*t

:

1-

Math.pow(

-2*t+2,

2

)/2;

},

lift(t){

return Math.sin(

t*Math.PI

);

}

};

/*-------------------------------------------------------
  RAF Loop
-------------------------------------------------------*/

function frame(timestamp){

if(!running){

return;

}

if(!lastFrame){

lastFrame=timestamp;

}

const delta=

Math.min(

FRAME_TIME*2,

timestamp-lastFrame

);

lastFrame=timestamp;

updateTimelines(delta);

rafId=requestAnimationFrame(frame);

}

/*-------------------------------------------------------
  Timeline Updates
-------------------------------------------------------*/

function updateTimelines(delta){

for(let i=queue.length-1;i>=0;i--){

const timeline=queue[i];

timeline.update(delta);

if(

timeline.finished||

timeline.cancelled

){

queue.splice(i,1);

}

}

if(queue.length===0){

stop();

}

}

/*-------------------------------------------------------
  Engine Control
-------------------------------------------------------*/

function start(){

if(running){

return;

}

running=true;

lastFrame=0;

rafId=requestAnimationFrame(frame);

}

function stop(){

running=false;

cancelAnimationFrame(rafId);

rafId=0;

lastFrame=0;

}

/*-------------------------------------------------------
  Public Playback
-------------------------------------------------------*/

animation.play=function(options){

const timeline=

options instanceof Timeline

?

options

:

new Timeline(options);

queue.push(timeline);

start();

return timeline;

};

animation.playAsync=function(options){

return new Promise(resolve=>{

const timeline=

options instanceof Timeline

?

options

:

new Timeline(options);

const originalComplete=

timeline.onComplete;

timeline.onComplete=()=>{

if(typeof originalComplete==="function"){

originalComplete();

}

resolve();

};

queue.push(timeline);

start();

});

};

/*-------------------------------------------------------
  Queue Management
-------------------------------------------------------*/

animation.clear=function(){

queue.length=0;

stop();

};

animation.cancelAll=function(){

queue.forEach(

timeline=>timeline.cancel()

);

queue.length=0;

stop();

};

animation.cancel=function(timeline){

if(!timeline)return;

timeline.cancel();

};

/*-------------------------------------------------------
  Status
-------------------------------------------------------*/

animation.running=function(){

return running;

};

animation.count=function(){

return queue.length;

};

animation.active=function(){

return queue.slice();

};

/*-------------------------------------------------------
  Timeline Factory
-------------------------------------------------------*/

animation.timeline=function(options){

return new Timeline(options);

};

/*-------------------------------------------------------
  Helpers
-------------------------------------------------------*/

animation.delay=function(ms){

return animation.playAsync({

duration:0,

delay:ms

});

};

animation.wait=animation.delay;

/*-------------------------------------------------------
  Public Easing
-------------------------------------------------------*/

animation.ease=Easing;

/*-------------------------------------------------------
  Version
-------------------------------------------------------*/

animation.version="1.0.0";



/*-------------------------------------------------------
  Animation Presets
-------------------------------------------------------*/

const Presets={

gentle:{

duration:340,

lift:10,

slide:18,

tilt:2,

shadow:18,

opacity:0.96

},

classic:{

duration:320,

lift:12,

slide:24,

tilt:3,

shadow:22,

opacity:0.95

},

fast:{

duration:220,

lift:6,

slide:12,

tilt:1.5,

shadow:14,

opacity:0.98

}

};

let currentPreset="gentle";

animation.theme=function(name){

if(Presets[name]){

currentPreset=name;

}

};

animation.currentTheme=function(){

return currentPreset;

};

function preset(){

return Presets[currentPreset];

}

/*-------------------------------------------------------
  Transform Helpers
-------------------------------------------------------*/

function applyTransform(
element,
x,
y,
rotation,
scale
){

    if(!element){
        return;
    }

    element.style.transform=
`translate3d(${x}px,${y}px,0)
 rotate(${rotation}deg)
 scale(${scale})`;

}

function applyShadow(
element,
offset,
blur,
opacity
){

    if(!element){
        return;
    }

    element.style.filter=
`drop-shadow(
0 ${offset}px ${blur}px
rgba(0,0,0,${opacity})
)`;

}



/*-------------------------------------------------------
  Page Lift
-------------------------------------------------------*/

animation.pageLift=function(element){

const p=preset();

return animation.playAsync({

duration:p.duration,

ease:Easing.lift,

onStart(){

element.classList.add(

"pageAnimating"

);

element.style.willChange=

"transform,filter,opacity";

},

onUpdate(value){

const y=

-p.lift*value;

element.style.opacity=

1-

((1-p.opacity)*value);

},

onComplete(){

element.style.opacity="";

}

});

};

/*-------------------------------------------------------
  Horizontal Slide
-------------------------------------------------------*/

animation.slide=function(

element,

direction

){

const p=preset();

const sign=

direction==="next"

?

1

:

-1;

return animation.playAsync({

duration:p.duration,

ease:Easing.easeInOut,

onUpdate(value){

const x=

sign*

p.slide*

value;

const rotation=

-sign*

p.tilt*

value;

const y=

-p.lift*

Math.sin(

value*Math.PI

);

applyTransform(

element,

x,

y,

rotation,

1

);

},

onComplete(){

applyTransform(

element,

0,

0,

0,

1

);

}

});

};

/*-------------------------------------------------------
  Combined Page Lift
-------------------------------------------------------*/

animation.pageTurnStart=

async function(

element,

direction

){

await Promise.all([

animation.pageLift(

element

),

animation.slide(

element,

direction

)

]);

};


/*-------------------------------------------------------
  Timeline Markers
-------------------------------------------------------*/

function createMarkers(){

return{

started:false,

lift:false,

audio:false,

turn:false,

settled:false

};

}

/*-------------------------------------------------------
  Audio Helper
-------------------------------------------------------*/

function playTurnAudio(){

/* Page-turn audio is owned by Sky180FlipEngine so it can begin at the
   first real user_fold/flipping state. Legacy animation timelines do not
   trigger a second, delayed copy. */

}

/*-------------------------------------------------------
  Marker Timeline
-------------------------------------------------------*/

animation.timelineTurn=function(options={}){

const element=options.element;

const direction=options.direction||"next";

const beforeTurn=options.beforeTurn||null;

const onTurn=options.turn||null;

const afterTurn=options.afterTurn||null;

const p=preset();

const markers=createMarkers();

return animation.playAsync({

duration:p.duration,

ease:Easing.easeInOut,

onStart(){

if(markers.started)return;

markers.started=true;

if(typeof beforeTurn==="function"){

beforeTurn();

}

},

onUpdate(value){

/*-------------------------
  Lift
-------------------------*/

if(

!markers.lift &&

value>=0.10

){

markers.lift=true;

element.classList.add(

"pageAnimating"

);

}

/*-------------------------
  Audio
-------------------------*/

if(

!markers.audio &&

value>=0.35

){

markers.audio=true;

playTurnAudio();

}

/*-------------------------
  Renderer Swap
-------------------------*/

if(

!markers.turn &&

value>=0.50

){

markers.turn=true;

if(typeof onTurn==="function"){

onTurn(direction);

}

}

/*-------------------------
  Settle Trigger
-------------------------*/

if(

!markers.settled &&

value>=0.85

){

markers.settled=true;

if(typeof afterTurn==="function"){

afterTurn();

}

}

},

onComplete(){

element.classList.remove(

"pageAnimating"

);

}

});

};

/*-------------------------------------------------------
  Shared Transition
-------------------------------------------------------*/

animation.transitionPage=

async function({

element,

direction,

beforeTurn,

turn,

afterTurn

}){

await Promise.all([

animation.pageLift(

element

),

animation.slide(

element,

direction

),

animation.timelineTurn({

element,

direction,

beforeTurn,

turn,

afterTurn

})

]);

};


/*-------------------------------------------------------
  Busy State
-------------------------------------------------------*/

let turning=false;

animation.turning=function(){

return turning;

};

/*-------------------------------------------------------
  Reset Element
-------------------------------------------------------*/

function resetElement(element){

if(!element){

return;

}

element.style.transform="";

element.style.filter="";

element.style.opacity="";

element.style.willChange="";

element.classList.remove(

"pageAnimating"

);

}

/*-------------------------------------------------------
  Settle Animation
-------------------------------------------------------*/

animation.settle=function(element){

const p=preset();

return animation.playAsync({

duration:120,

ease:Easing.easeOut,

onUpdate(value){

const lift=

(1-value)*2;

const opacity=

p.opacity+

((1-p.opacity)*value);

applyTransform(

element,

0,

-lift,

0,

1

);

applyShadow(

element,

6*(1-value),

18,

0.15*(1-value)

);

element.style.opacity=

opacity;

},

onComplete(){

resetElement(element);

}

});

};

/*-------------------------------------------------------
  Internal Page Turn
-------------------------------------------------------*/

async function performTurn(

element,

direction,

callback

){

if(turning){

return false;

}

turning=true;

try{

await animation.transitionPage({

element,

direction,

beforeTurn(){

},

turn(){

if(typeof callback==="function"){

callback();

}

},

afterTurn(){

}

});

await animation.settle(

element

);

return true;

}

finally{

turning=false;

}

}

/*-------------------------------------------------------
  Public API
-------------------------------------------------------*/

animation.pageTurnNext=

async function(

element,

callback

){

return performTurn(

element,

"next",

callback

);

};

animation.pageTurnPrevious=

async function(

element,

callback

){

return performTurn(

element,

"previous",

callback

);

};

/*-------------------------------------------------------
  Generic Runner
-------------------------------------------------------*/

animation.pageTurn=

async function({

element,

direction="next",

callback

}){

return performTurn(

element,

direction,

callback

);

};

/*-------------------------------------------------------
  Cleanup
-------------------------------------------------------*/

animation.reset=function(element){

resetElement(element);

};

animation.stop=function(){

animation.cancelAll();

turning=false;

};

/*-------------------------------------------------------
  Statistics
-------------------------------------------------------*/

animation.statistics=function(){

return{

running,

turning,

queued:queue.length,

theme:currentPreset

};

};

/*-------------------------------------------------------
  Export
-------------------------------------------------------*/

return animation;

})();

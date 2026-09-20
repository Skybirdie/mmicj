"use strict";

/*
=========================================================
 SkyMedia Zoom Controller

 Shared zoom behavior for slideshow content and Front Page
 centerpiece media.

 Controls:
 - Desktop: Ctrl + mouse wheel
 - Touch: two-finger pinch
 - Touch/mouse drag while zoomed pans the content
 - Freshly created controller starts at 1x
 - The zoom level may remain active while a slideshow plays
=========================================================
*/
window.SkyMediaZoom = (function(){
    const MIN=1;
    const MAX=4;
    const STEP=1.2;

    function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }

    function create(container){
        if(!container) return null;

        let target=null;
        let scale=1;
        let x=0;
        let y=0;
        let destroyed=false;
        const pointers=new Map();
        let pinchStartDistance=0;
        let pinchStartScale=1;
        let pinchStartMid={x:0,y:0};
        let pinchStartPan={x:0,y:0};
        let dragPointerId=null;
        let dragStart={x:0,y:0,panX:0,panY:0};

        const indicator=document.createElement("div");
        indicator.className="skymedia-zoom-indicator";
        indicator.setAttribute("aria-label","Zoomed in");
        indicator.setAttribute("title","Zoomed in");
        indicator.hidden=true;
        container.appendChild(indicator);

        container.classList.add("skymedia-zoom-container");

        function limits(){
            const w=Math.max(1,container.clientWidth);
            const h=Math.max(1,container.clientHeight);
            return {
                x:Math.max(0,(w*(scale-1))/2),
                y:Math.max(0,(h*(scale-1))/2)
            };
        }

        function constrain(){
            const lim=limits();
            x=clamp(x,-lim.x,lim.x);
            y=clamp(y,-lim.y,lim.y);
        }

        function ensureIndicator(){
            if(!indicator.isConnected && !destroyed) container.appendChild(indicator);
        }

        function apply(){
            if(destroyed) return;
            ensureIndicator();
            if(target){
                target.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;
                target.style.transformOrigin="center center";
            }
            indicator.hidden=scale<=MIN+0.001;
            container.classList.toggle("is-zoomed",scale>MIN+0.001);
        }

        function reset(){
            scale=1;
            x=0;
            y=0;
            apply();
        }

        function disableTransformAnimation(){
            if(!target) return;
            target.style.animation="none";
        }

        function setScale(next,center){
            const old=scale;
            if(next!==MIN) disableTransformAnimation();
            scale=clamp(next,MIN,MAX);
            if(scale===MIN){x=0;y=0;}
            else if(center){
                /* Keep the point under the pointer/fingers visually fixed. */
                const rect=container.getBoundingClientRect();
                const cx=center.x-rect.left-rect.width/2;
                const cy=center.y-rect.top-rect.height/2;
                const ratio=(scale/old)-1;
                x-=cx*ratio;
                y-=cy*ratio;
            }
            constrain();
            apply();
        }

        function setTarget(nextTarget){
            if(target){
                target.style.transform="";
                target.classList.remove("skymedia-zoom-target");
            }
            target=nextTarget||null;
            if(target){
                target.classList.add("skymedia-zoom-target");
                if(scale>MIN+0.001) disableTransformAnimation();
                apply();
            }else{
                reset();
            }
        }

        function distance(a,b){
            return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
        }
        function midpoint(a,b){
            return {x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2};
        }

        function onWheel(event){
            if(destroyed || !target || !event.ctrlKey) return;
            event.preventDefault();
            event.stopPropagation();
            const factor=event.deltaY<0?STEP:1/STEP;
            setScale(scale*factor,{x:event.clientX,y:event.clientY});
        }

        function onPointerDown(event){
            if(destroyed || !target) return;
            pointers.set(event.pointerId,event);

            if(pointers.size===2){
                const pts=[...pointers.values()];
                pinchStartDistance=distance(pts[0],pts[1]);
                pinchStartScale=scale;
                pinchStartMid=midpoint(pts[0],pts[1]);
                pinchStartPan={x,y};
                dragPointerId=null;
                event.preventDefault();
                return;
            }

            if(pointers.size===1 && scale>MIN+0.001){
                dragPointerId=event.pointerId;
                dragStart={x:event.clientX,y:event.clientY,panX:x,panY:y};
                try{container.setPointerCapture(event.pointerId);}catch(e){}
                event.preventDefault();
            }
        }

        function onPointerMove(event){
            if(!pointers.has(event.pointerId) || !target) return;
            pointers.set(event.pointerId,event);

            if(pointers.size>=2){
                const pts=[...pointers.values()].slice(0,2);
                const d=distance(pts[0],pts[1]);
                if(pinchStartDistance>0){
                    const next=pinchStartScale*(d/pinchStartDistance);
                    const mid=midpoint(pts[0],pts[1]);
                    scale=clamp(next,MIN,MAX);
                    const dx=mid.x-pinchStartMid.x;
                    const dy=mid.y-pinchStartMid.y;
                    x=pinchStartPan.x+dx;
                    y=pinchStartPan.y+dy;
                    constrain();
                    apply();
                }
                event.preventDefault();
                return;
            }

            if(dragPointerId===event.pointerId && scale>MIN+0.001){
                x=dragStart.panX+(event.clientX-dragStart.x);
                y=dragStart.panY+(event.clientY-dragStart.y);
                constrain();
                apply();
                event.preventDefault();
            }
        }

        function onPointerUp(event){
            pointers.delete(event.pointerId);
            if(dragPointerId===event.pointerId) dragPointerId=null;
            if(pointers.size<2) pinchStartDistance=0;
        }

        function onDoubleClick(event){
            if(!target) return;
            if(event.ctrlKey) return;
            if(scale>MIN) reset();
            else setScale(2,{x:event.clientX,y:event.clientY});
        }

        container.addEventListener("wheel",onWheel,{passive:false});
        container.addEventListener("pointerdown",onPointerDown,{passive:false});
        container.addEventListener("pointermove",onPointerMove,{passive:false});
        container.addEventListener("pointerup",onPointerUp,{passive:false});
        container.addEventListener("pointercancel",onPointerUp,{passive:false});
        container.addEventListener("dblclick",onDoubleClick);

        function destroy(){
            if(destroyed) return;
            destroyed=true;
            container.removeEventListener("wheel",onWheel);
            container.removeEventListener("pointerdown",onPointerDown);
            container.removeEventListener("pointermove",onPointerMove);
            container.removeEventListener("pointerup",onPointerUp);
            container.removeEventListener("pointercancel",onPointerUp);
            container.removeEventListener("dblclick",onDoubleClick);
            if(target) target.style.transform="";
            indicator.remove();
            container.classList.remove("skymedia-zoom-container","is-zoomed");
        }

        apply();
        return {setTarget,reset,destroy,getScale:()=>scale};
    }

    return {create};
})();

"use strict";

window.SettingsPanel=(function(){
    const api={};
    let root=null;

    function ensure(){
        if(root)return root;
        root=document.createElement("div");
        root.id="srSettingsPanel";
        root.className="sr-settings-panel hidden";
        root.innerHTML=`
          <div class="sr-settings-backdrop" data-close="1"></div>
          <section class="sr-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="srSettingsTitle">
            <div class="sr-settings-header">
              <h2 id="srSettingsTitle">Settings</h2>
              <button type="button" class="sr-settings-close" aria-label="Close settings">×</button>
            </div>
            <div class="sr-settings-body">
              <label class="sr-setting-row"><span>Dark theme</span><input id="srSettingTheme" type="checkbox"></label>
              <label class="sr-setting-row"><span>Remember reading position</span><input id="srSettingRemember" type="checkbox"></label>
              <label class="sr-setting-row"><span>Remember zoom</span><input id="srSettingZoom" type="checkbox"></label>
              <label class="sr-setting-row"><span>Page-turn sound</span><input id="srSettingSound" type="checkbox"></label>

<label class="sr-setting-row">
  <span>Continue media playback in background</span>
  <input id="srSettingBackgroundMedia" type="checkbox">
</label>

              <label class="sr-setting-row sr-setting-range"><span>Sound volume</span><input id="srSettingVolume" type="range" min="0" max="1" step="0.05"></label>
              <button type="button" id="srFullscreenButton" class="sr-settings-action">Enter fullscreen</button>
            </div>
          </section>`;
        document.body.appendChild(root);

        root.querySelector(".sr-settings-close").onclick=api.hide;
        root.querySelector(".sr-settings-backdrop").onclick=api.hide;
        root.querySelector("#srSettingTheme").onchange=()=>{
            const dark=root.querySelector("#srSettingTheme").checked;
            document.documentElement.dataset.theme=dark?"dark":"light";
            const meta=document.querySelector('meta[name="theme-color"]');
            if(meta)meta.content=dark?"#181b20":"#ffffff";
            StorageManager.setTheme(dark?"dark":"light");
        };
        root.querySelector("#srSettingRemember").onchange=()=>{
            SkyReader.settings.rememberReading=root.querySelector("#srSettingRemember").checked;
            StorageManager.saveSettings();
        };
        root.querySelector("#srSettingZoom").onchange=()=>{
            SkyReader.settings.rememberZoom=root.querySelector("#srSettingZoom").checked;
            StorageManager.saveSettings();
        };
        root.querySelector("#srSettingSound").onchange=()=>{
            const enabled=root.querySelector("#srSettingSound").checked;
            if(window.AudioController){
                if(enabled)AudioController.unmute(); else AudioController.mute();
            }
            StorageManager.setMuted(!enabled);
        };

        root.querySelector("#srSettingBackgroundMedia").onchange=()=>{
            if(window.MediaManager){
                MediaManager.setBackgroundPlayback(
                    root.querySelector("#srSettingBackgroundMedia").checked
                );
            }
        };
        root.querySelector("#srSettingVolume").oninput=event=>{
            const value=Number(event.target.value);
            if(window.AudioController)AudioController.setVolume(value);
            StorageManager.setVolume(value);
        };
        root.querySelector("#srFullscreenButton").onclick=async()=>{
            if(typeof UI!=="undefined" && UI.toggleFullscreen){
                await UI.toggleFullscreen();
                api.sync();
            }
        };
        return root;
    }

    api.sync=function(){
        const el=ensure();
        const settings=SkyReader.settings||{};
        const state={theme:settings.theme||"light", muted:window.AudioController?AudioController.isMuted():false, volume:window.AudioController?AudioController.volume():0.35};
        el.querySelector("#srSettingTheme").checked=state.theme==="dark";
        el.querySelector("#srSettingRemember").checked=settings.rememberReading!==false;
        el.querySelector("#srSettingZoom").checked=settings.rememberZoom!==false;
        el.querySelector("#srSettingSound").checked=window.AudioController?!AudioController.isMuted():state.muted!==true;
        el.querySelector("#srSettingVolume").value=window.AudioController?AudioController.volume():state.volume;

el.querySelector("#srSettingBackgroundMedia").checked =
    window.MediaManager
        ? MediaManager.getBackgroundPlayback()
        : false;
        el.querySelector("#srFullscreenButton").textContent=(typeof UI!=="undefined"&&UI.isFullscreen&&UI.isFullscreen())?"Exit fullscreen":"Enter fullscreen";
    };

    api.show=function(){
        const el=ensure();
        api.sync();
        el.classList.remove("hidden");
        requestAnimationFrame(()=>el.classList.add("visible"));
    };

    api.hide=function(){
        if(!root)return;
        root.classList.remove("visible");
        root.classList.add("hidden");
    };

    api.toggle=function(){
        if(root && root.classList.contains("visible"))api.hide();
        else api.show();
    };

    return api;
})();

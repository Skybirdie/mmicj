"use strict";

window.StorageManager={

key:"SkyReader",

defaults:{
lastMagazine:null,
lastPage:0,
shelfView:true,
muted:false,
volume:.5,
zoom:1,
theme:"light",
readAgainVisible:true
},

load(){

let data={};

try{

data=JSON.parse(localStorage.getItem(this.key)||"{}");

}catch(e){

console.warn("Storage read failed.",e);

data={};

}

const state={...this.defaults,...data};

SkyReader.resume.magazineId=state.lastMagazine;
SkyReader.resume.page=state.lastPage;

SkyReader.sound.enabled=!state.muted;
SkyReader.sound.volume=state.volume;

SkyReader.zoom=state.zoom;

SkyReader.settings.theme=state.theme;

SkyReader.ui.shelfView=state.shelfView;
SkyReader.settings.readAgainVisible=state.readAgainVisible!==false;

return state;

},

save(){

const state={

lastMagazine:SkyReader.currentMagazine?.id||null,

lastPage:SkyReader.currentPage,

shelfView:SkyReader.ui.shelfView,

muted:!SkyReader.sound.enabled,

volume:SkyReader.sound.volume,

zoom:SkyReader.zoom,

theme:SkyReader.settings.theme,
readAgainVisible:SkyReader.settings.readAgainVisible!==false

};

try{
    localStorage.setItem(
        this.key,
        JSON.stringify(state)
    );
}catch(e){
    console.warn("Storage save failed; continuing without persistent settings.",e);
}

},

clear(){

localStorage.removeItem(this.key);

},

savePage(){

this.save();

},

saveSettings(){

this.save();

},

setTheme(theme){

SkyReader.settings.theme=theme;

this.save();

},

setShelfView(value){

SkyReader.ui.shelfView=value;

this.save();

},

setMuted(value){

SkyReader.sound.enabled=!value;

this.save();

},

setVolume(volume){

SkyReader.sound.volume=

Math.max(0,Math.min(1,volume));

this.save();

}

};

window.addEventListener("beforeunload",()=>{

StorageManager.save();

});
"use strict";

/*

SkyReader Search Panel

Responsibilities

• Search UI
• Result list
• Jump to result
• Standalone module

=========================================================
*/

window.SearchPanel=(function(){

const search={};

let root;
let input;
let list;
let initialized=false;

let currentQuery="";
let currentResults=[];

/*-------------------------------------------------------
Build
-------------------------------------------------------*/

search.build=function(parent){

MMicjMedia
if(initialized){

    return;

}

root=document.createElement("aside");

root.id="srSearchPanel";

root.className="sr-search-panel";

root.hidden=true;

const header=document.createElement("div");

header.className="sr-search-header";

const title=document.createElement("h3");

title.textContent="Search";

const close=document.createElement("button");

close.className="sr-search-close";

close.textContent="✕";

close.addEventListener(
    "click",
    ()=>search.hide()
);

header.appendChild(title);
header.appendChild(close);

input=document.createElement("input");

input.className="sr-search-input";

input.type="search";

input.placeholder="Search this magazine...";

input.addEventListener(
    "keydown",
    event=>{

        if(event.key==="Enter"){

            search.execute(input.value);

        }

    }
);

list=document.createElement("div");

list.className="sr-search-results";

root.appendChild(header);
root.appendChild(input);
root.appendChild(list);

parent.appendChild(root);

initialized=true;
MMicjMedia

};

/*-------------------------------------------------------
Execute
-------------------------------------------------------*/

search.execute=async function(query){

MMicjMedia
currentQuery=(query||"").trim();

if(!currentQuery){

    renderEmpty("Type a search term.");

    return;
}

renderLoading();

// This module is UI-first. If Reader exposes a text
// search API later, it will be used automatically.

if(
    window.Reader &&
    typeof Reader.search==="function"
){

    currentResults=
        await Reader.search(currentQuery);

}else{

    currentResults=[];

}

renderResults();
MMicjMedia

};

/*-------------------------------------------------------
Render
-------------------------------------------------------*/

function renderLoading(){

MMicjMedia
list.innerHTML="";

const loading=document.createElement("div");

loading.className="sr-search-empty";

loading.textContent="Searching...";

list.appendChild(loading);
MMicjMedia

}

function renderEmpty(text){

MMicjMedia
list.innerHTML="";

const empty=document.createElement("div");

empty.className="sr-search-empty";

empty.textContent=text;

list.appendChild(empty);
MMicjMedia

}

function renderResults(){

MMicjMedia
list.innerHTML="";

if(currentResults.length===0){

    renderEmpty(
        "No results found."
    );

    return;
}

currentResults.forEach(result=>{

    list.appendChild(
        createResult(result)
    );

});
MMicjMedia

}

/*-------------------------------------------------------
Result Row
-------------------------------------------------------*/

function createResult(result){

MMicjMedia
const row=document.createElement("button");

row.className="sr-search-result";

const title=document.createElement("div");

title.className="sr-search-result-title";

title.textContent=
    "Page "+(result.page+1);

const excerpt=document.createElement("div");

excerpt.className="sr-search-result-excerpt";

excerpt.textContent=
    result.excerpt||"";

row.appendChild(title);
row.appendChild(excerpt);

row.addEventListener(
    "click",
    ()=>{

        SRNavigation.goToPage(result.page);

        search.hide();

    }
);

return row;
MMicjMedia

}

/*-------------------------------------------------------
Visibility
-------------------------------------------------------*/

search.show=function(){

MMicjMedia
root.hidden=false;

input.focus();
MMicjMedia

};

search.hide=function(){

MMicjMedia
root.hidden=true;
MMicjMedia

};

search.toggle=function(){

MMicjMedia
root.hidden
    ? search.show()
    : search.hide();
MMicjMedia

};

/*-------------------------------------------------------
State
-------------------------------------------------------*/

search.query=function(){

MMicjMedia
return currentQuery;
MMicjMedia

};

search.results=function(){

MMicjMedia
return currentResults.slice();
MMicjMedia

};

/*-------------------------------------------------------
Helpers
-------------------------------------------------------*/

search.element=function(){

MMicjMedia
return root;
MMicjMedia

};

search.initialized=function(){

MMicjMedia
return initialized;
MMicjMedia

};

/*-------------------------------------------------------
Cleanup
-------------------------------------------------------*/

search.destroy=function(){

MMicjMedia
currentQuery="";
currentResults=[];

if(
    root &&
    root.parentNode
){

    root.parentNode.removeChild(root);

}

root=null;
input=null;
list=null;
initialized=false;
MMicjMedia

};

return search;

})();

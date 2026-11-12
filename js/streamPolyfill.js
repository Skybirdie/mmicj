/*
 * ReadableStream async iteration, for browsers that lack it.
 *
 * pdf.js 6 reads a page's text with `for await (const chunk of stream)`.
 * Safari / WebKit (every browser on an iPhone, including Chrome "CriOS")
 * does not give ReadableStream that, so reading page text threw
 * "undefined is not a function (near '...t of e...')" and Read Aloud
 * could not get any text, while drawing the pages still worked.
 *
 * Browsers that already have it are left completely alone. Must load
 * BEFORE pdf.js (see index.html). Safe to load twice.
 */
(function(){
    "use strict";
    try{
        if(typeof ReadableStream==="undefined"||typeof Symbol==="undefined"||!Symbol.asyncIterator)return;
        var proto=ReadableStream.prototype;
        if(typeof proto[Symbol.asyncIterator]==="function")return;

        var values=function(options){
            var reader=this.getReader();
            var preventCancel=!!(options&&options.preventCancel);
            var finished=false;
            var release=function(){try{reader.releaseLock();}catch(e){}};
            var iterator={
                next:function(){
                    if(finished)return Promise.resolve({done:true,value:undefined});
                    return reader.read().then(function(result){
                        if(result.done){finished=true;release();}
                        return result;
                    },function(error){
                        finished=true;release();
                        throw error;
                    });
                },
                "return":function(value){
                    if(finished)return Promise.resolve({done:true,value:value});
                    finished=true;
                    if(preventCancel){release();return Promise.resolve({done:true,value:value});}
                    return reader.cancel(value).then(function(){
                        release();
                        return {done:true,value:value};
                    },function(error){
                        release();
                        throw error;
                    });
                }
            };
            iterator[Symbol.asyncIterator]=function(){return this;};
            return iterator;
        };

        Object.defineProperty(proto,"values",{value:values,writable:true,configurable:true,enumerable:false});
        Object.defineProperty(proto,Symbol.asyncIterator,{value:values,writable:true,configurable:true,enumerable:false});

        /* so the speech check report can say the app patched this itself */
        window.mmicjPolyfilled=(window.mmicjPolyfilled||[]).concat(["ReadableStream async iteration"]);
    }catch(error){}
})();

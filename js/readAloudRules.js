"use strict";

/* =========================================================
   readAloudRules.js - how "Listen" (js/readAloud.js) SPEAKS the text.

   This file only changes what the voice is handed. It never changes
   what is shown on a page. To adjust the way something is read, edit
   the lists in the three EDIT HERE sections below; nothing else needs
   to be touched.

   Every rule works on one sentence-sized piece of text at a time and
   is a pure function (no page, no network, no cost).

   1. WORDS       a word that should be said another way (names, acronyms).
                  MMICJ is spelled out wherever it appears, in any letter case;
                  mmicj.com is "em em eye see jay dot com"
   2. ABBREVIATIONS  "e.g." -> "for example", "Dr." -> "Doctor", "U.S." -> "U S"
   3. PUNCTUATION colons, semicolons and dashes are never spoken, they only
                  separate what is before from what is after them.
                  Arrows (→ --> => and " > " between words) are steps: "Settings, then General"
   4. LISTS       "apples, pears and oranges" -> "apples, pears, and oranges"
   5. NUMBERS     "16 For God so loved": the number is spoken on its own, then a real
                  silent gap (GAPS.number), then the sentence
   6. SUPERSCRIPTS footnote and verse numbers: readAloud.js marks them, a full stop
                  is spoken after each one
   7. PAUSES      a real silent gap after every paragraph / forced line break
                  (see GAPS). readAloud.js reads these numbers.
   Ornamental symbols (stars, diamonds, emoji ...) are handled in readAloud.js:
   never described; a bullet at the start of a line, a full stop elsewhere.
========================================================= */

window.ReadAloudRules=(function(){

const api={};

/*=======================================================
  EDIT HERE (1/4) - WORDS
  [ "written word", "how to say it", options ]
  Write the spoken form the way it should SOUND (a voice reads "M M I C J"
  as "m mic j", so letters are written out: "em em eye see jay").
  Normally whole words only, any capitals; "Liburd's" is covered by "Liburd".
  options.anywhere: replace it wherever these letters appear, even inside
  another word or address (mmicj.com, MMICJs, mmicj-admin), any letter case,
  and even if the PDF put a space or soft hyphen between the letters.
=======================================================*/
api.words=[
    ["MMICJ",     "em em eye see jay", {anywhere:true}],   /* always its letters: M M I C J */
    ["Liburd",    "Lie bird"],
    /* "Naff": a real English word. Some iPhone voices spell out an unfamiliar three-letter token
       ("Naf" was said as "en a f"), but say a dictionary word normally. Said the same way: "naf". */
    ["Naphatali", "Naff tah lee"]
];

/*=======================================================
  EDIT HERE (1b/4) - ARROWS
  An arrow between two points ("Settings → General", "Menu --> Settings", "A => B", and also
  "Settings > General > Software Update" with spaces) is a step from one point to the next. It is
  never described ("rightward arrow"); it is said as a short pause, followed by this word.
  Write "" for a pause only: "Settings, General". Arrows pointing any other way are only a pause.
=======================================================*/
api.arrowSays="then";

/*=======================================================
  EDIT HERE (2/4) - ABBREVIATIONS
  [ "pattern", "how to say it", options ]
  The pattern is a regular expression for the abbreviation (dots escaped
  as \\. ). Capital letters at the start are kept: "E.g." -> "For example".
  options.breakBeforeCapital: the abbreviation can end a sentence
  ("... and so on etc. The next ...") so a full stop is kept there.
  Dotted capitals not listed here (U.S., U.K., N.B., J.R.R.) are spelled
  out as letters automatically: "U S", "U K", "N B".
=======================================================*/
api.abbreviations=[
    ["e\\.g\\.?",       "for example"],
    ["i\\.e\\.?",       "that is"],
    ["etc\\.?",         "et cetera", {breakBeforeCapital:true}],
    ["vs\\.?",          "versus"],
    ["cf\\.",           "compare"],
    ["viz\\.",          "namely"],
    ["Mr\\.",           "Mister"],
    ["Mrs\\.",          "Missus"],
    ["Ms\\.",           "Miz"],
    ["Dr\\.",           "Doctor"],
    ["Prof\\.",         "Professor"],
    ["Rev\\.",          "Reverend"],
    ["Jr\\.",           "Junior"],
    ["Sr\\.",           "Senior"],
    ["Fig\\.",          "Figure"],
    ["Figs\\.",         "Figures"],
    ["Vol\\.",          "Volume"],
    ["pp\\.",           "pages"],
    ["p\\.(?=\\s*\\d)", "page"],
    ["approx\\.",       "approximately"],
    ["Inc\\.",          "Incorporated"],
    ["Ltd\\.",          "Limited"],
    ["dept\\.",         "department"]
];

/*=======================================================
  EDIT HERE (3/4) - NUMBERS AT THE START OF A SENTENCE
  "16 For God so loved ..." (a Bible verse) is read as the number "16",
  then a real silent gap (GAPS.number below), then "For God so loved ...".
  The same for "3:16 For God ...", "(1) Pray ..." and "3 Rules for Peace".
  Numbers of 1 to 3 digits are treated this way. NOT touched: the numbered
  books below ("1 Peter", "2 Kings"), dates ("5 November"), times and eras
  ("10 a.m.", "70 AD"), and numbers of 4 digits or more ("2024 was ...").
=======================================================*/
api.numberedBooks=["Samuel","Kings","Chronicles","Corinthians","Thessalonians","Timothy","Peter","John","Esdras","Maccabees",
                   "Sam","Kgs","Chr","Cor","Thess","Tim","Pet","Jn"];
api.months=["January","February","March","April","May","June","July","August","September","October","November","December",
            "Jan","Feb","Mar","Apr","Jun","Jul","Aug","Sep","Sept","Oct","Nov","Dec"];
api.numberUnits=["a.m","p.m","am","pm","AD","BC","BCE","CE","percent"];

/*=======================================================
  EDIT HERE (4/4) - GAPS (milliseconds of silence)
  paragraph: after a paragraph, a title, a line that stands on its own,
             or any other forced line break. At the normal speed this is
             about the length of the pause after a full stop.
  number:    after a number that starts a sentence (Bible verse numbers).
             Longer than the paragraph gap so the number stands apart.
  The gaps are shortened a little when the reader speeds the voice up.
  Set one to 0 to switch it off.
=======================================================*/
api.gaps={paragraph:450, number:800};

/*=======================================================
  The machinery (no need to edit below this line)
=======================================================*/

const LET="\\p{L}\\p{N}";
const esc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const cap=(src,out)=>/^\p{Lu}/u.test(src)?out.charAt(0).toUpperCase()+out.slice(1):out;

let compiled=null;
function compile(){
    const alt=list=>"^(?:"+(list||[]).map(esc).join("|")+")$";
    compiled={
        books:new RegExp(alt(api.numberedBooks),"i"),
        months:new RegExp(alt(api.months),"i"),
        units:new RegExp(alt(api.numberUnits),"i"),
        words:(api.words||[]).map(w=>{
            const o=w[2]||{};
            if(o.anywhere){
                /* the letters in a row, with at most one space / soft hyphen / zero-width mark between two of them */
                const between="[\\s\\u00AD\\u200B-\\u200D\\u2060\\uFEFF]?";
                const letters=Array.from(String(w[0])).map(esc).join(between);
                return {
                    anywhere:true,re:new RegExp(letters,"giu"),say:String(w[1]),
                    /* mmicj.com / www.mmicj.com: the name followed by a dot and a short lower-case or upper-case ending */
                    dom:new RegExp("((?:www\\.)?)("+letters+")\\.(?=[a-z]{2,24}(?![\\p{L}\\p{N}]))","giu")
                };
            }
            return {
                re:new RegExp("(^|[^"+LET+"])("+esc(w[0])+")(?![" + LET + "])","giu"),
                say:String(w[1])
            };
        }),
        abbr:(api.abbreviations||[]).map(a=>({
            re:new RegExp("(^|[^"+LET+".])("+a[0]+")(?![" + LET + "])","giu"),
            say:String(a[1]),
            brk:!!(a[2]&&a[2].breakBeforeCapital)
        }))
    };
}
/* call after editing api.words / api.abbreviations at run time (tests do) */
api.recompile=function(){compiled=null;};

function words(t){
    const isLet=c=>!!c&&/[\p{L}\p{N}]/u.test(c);
    for(const w of compiled.words){
        if(w.anywhere){
            /* A web address: a voice meets "jay.com" and spells the word letter by letter ("j a y dot com").
               Say the dot as a word, apart from the name: mmicj.com -> "em em eye see jay dot com".
               "MMICJ.Come" (a missing space after a full stop) is not an address and is left as it was. */
            if(w.dom)t=t.replace(w.dom,(m,www,name,off,str)=>{
                const ending=(str.slice(off+m.length).match(/^[A-Za-z]+/)||[""])[0];
                if(ending!==ending.toLowerCase()&&ending!==ending.toUpperCase())return m;
                return (www?"w w w dot ":"")+name+" dot ";
            });
            /* spoken form gets its own spaces when it was glued to other letters (MMICJs -> "... jay s") */
            t=t.replace(w.re,(m,off,str)=>(isLet(str.charAt(off-1))?" ":"")+w.say+(isLet(str.charAt(off+m.length))?" ":""));
        }else t=t.replace(w.re,(m,pre)=>pre+w.say);
    }
    return t;
}

/* a final full stop on an abbreviation is kept when it was also the end of the piece */
function abbreviations(t){
    for(const a of compiled.abbr){
        t=t.replace(a.re,(m,pre,ab,off,str)=>{
            const after=str.slice(off+m.length);
            const dot=/\.$/.test(ab);
            const atEnd=/^\s*$/.test(after)||(a.brk&&/^\s+[\p{Lu}\p{N}]/u.test(after));
            return pre+cap(ab,a.say)+(dot&&atEnd?".":"");
        });
    }
    /* dotted capitals: U.S.A. -> "U S A" */
    t=t.replace(new RegExp("(^|[^"+LET+".])((?:\\p{L}\\.){2,})(?![" + LET + "])","gu"),(m,pre,ab,off,str)=>{
        const after=str.slice(off+m.length);
        const spelled=ab.replace(/\./g," ").trim().toUpperCase();
        return pre+spelled.split("").join(" ")+(/^\s*$/.test(after)?".":"");
    });
    return t;
}

/* a superscript (footnote or verse number) leaves an invisible mark: it becomes a full stop */
function superscripts(t){
    t=t.replace(/\s*⁣\s*(?=[.!?…])/g,"");                  /* a full stop follows anyway */
    t=t.replace(/([.!?…]["')\]”’]*)\s*⁣\s*/g,"$1 ");   /* one already came before */
    return t.replace(/\s*⁣\s*/g,". ");
}

/* A number that starts a sentence ("16 For God so loved", "3:16 For God", "(1) Pray"): returns
   {num, rest} so the number can be spoken on its own, or null when it is not one (1 Peter, 5 November,
   10 a.m., a number of 4 or more digits, a number followed by a digit). */
const LEAD=/^\(?(\d{1,3}(?::\d{1,3}(?:\s*[-\u2013]\s*\d{1,3})?)?)[.):,]?\s+(?=\p{L})/u;
function splitLead(t){
    const m=t.match(LEAD);
    if(!m)return null;
    const rest=t.slice(m[0].length);
    const next=((rest.match(/^\p{L}[\p{L}.'\u2019]*/u)||[""])[0]).replace(/\.+$/,"");
    if(/^\d$/.test(m[1])&&compiled.books.test(next))return null;      /* 1 Peter, 2 Kings */
    if(compiled.months.test(next))return null;                         /* 5 November */
    if(compiled.units.test(next))return null;                          /* 10 a.m., 70 AD */
    return {num:m[1],rest:rest};
}

/* Arrows are steps from one point to the next, never described. Pointing right (and "-->", "=>", and a
   spaced ">" between two words): a pause and api.arrowSays ("Settings, then General"). Any other arrow
   (left, up, both ways): only a pause. At the very start of the piece nothing is added; at the very end,
   only a pause. Runs before the dash rules, which would otherwise read "-->" as a dash and "greater than". */
function arrows(t){
    const say=api.arrowSays?String(api.arrowSays).trim():"";
    const step=(m,off,str)=>off===0?"":(off+m.length>=str.length?",":(say?", "+say+" ":", "));
    const stop=(m,off,str)=>off===0?"":(off+m.length>=str.length?"":", ");
    t=t.replace(/\s*<[-=]+>?\s*/g,stop);                                                        /* <--  <-->  <== */
    t=t.replace(/\s*(?:[-=]+>|[\u2192\u21A6\u21D2\u21E8\u27F6\u27F9\u27FC\u2794\u2799-\u27A1\u27A2\u2B95])\s*/g,step);   /* -->  =>  → ⇒ ⟶ ➔ ➡ */
    t=t.replace(/\s*[\u2190-\u21FF\u27F0-\u27FF\u2B00-\u2B11]\s*/g,stop);                            /* every other arrow */
    t=t.replace(/([\p{L}.)\u201D"'\u2019])\s+>\s+(?=[\p{L}(\u201C"'\u2018])/gu,(m,pre,off,str)=>pre+(say?", "+say+" ":", "));  /* Settings > General */
    return t;
}

/* Whatever is left of a colon, semicolon or dash after the rules below is removed here as well.
   They are never said: they separate. (The same pass runs once more, last of all, in api.enforce.) */
function sweep(t){
    t=arrows(t);
    t=t.replace(/\s*(?:--+|[\u2012-\u2015\u2E3A\u2E3B\uFE58])\s*/g,", ");                /* long and short dashes, double hyphen */
    t=t.replace(/\s+[-\u2010\u2011]+\s+/g,", ");                                /* a spaced hyphen: " - " */
    t=t.replace(/([\p{L}\p{N}])[-\u2010\u2011]+(?=[\p{L}\p{N}])/gu,"$1 ");      /* well-known, COVID-19, e-mail */
    t=t.replace(/[-\u2010\u2011]+(?!\d)/g," ");                                  /* any other stray hyphen (a minus sign before a digit stays) */
    t=t.replace(/\s*[:;\uFF1A\uFF1B\uFE54\uFE55\u037E\u061B]\s*/g,", ");         /* a colon or semicolon wherever it is */
    return t;
}

/* Colons, semicolons and dashes are never said; they separate. A comma gives the
   short, even pause that every voice understands. Chapter:verse and times (3:16, 10:30)
   become two numbers ("3 16"); 5-10 and 3:16-18 are read "5 to 10", "3 16 to 18". */
function separators(t,atEnd){
    t=arrows(t);
    t=t.replace(/(\d)\s*[\u2012\u2013]\s*(\d)/g,"$1\u0001$2");                       /* 5 - 10 (en dash between numbers) */
    t=t.replace(/(^|[^\d\-])(\d{1,4})-(\d{1,4})(?![\d\-])/g,"$1$2\u0001$3");        /* 5-10, 16-18, 1914-1918 (hyphen between two numbers) */
    t=t.replace(/\s*(?:--+|[\u2012-\u2015\u2E3A\u2E3B\uFE58])\s*/g,", ");           /* dashes, long and short */
    t=t.replace(/(\d):(?=\d)/g,"$1 ");                                               /* 3:16, 10:30, 3:1 */
    t=t.replace(/\s*:\s*$/,atEnd?".":",");                                           /* a title that ends in a colon */
    t=sweep(t);
    t=t.replace(/(\s*,){2,}/g,",");
    t=t.replace(/([.!?…])\s*,/g,"$1");
    t=t.replace(/^[\s,]+/,"");
    t=t.replace(/\u0001/g," to ");
    return t;
}

const INTRO=/^(however|therefore|then|thus|hence|so|now|yes|no|well|also|indeed|moreover|furthermore|meanwhile|instead|finally|first|second|third|next|later|today|tomorrow|yesterday|in|on|at|by|for|with|from|to|of|after|before|when|while|if|as|although|though|because|since|once|until|unless|during|through|under|over|between|among|without|within|about|against|despite|whenever|where|whether|and|but|or|nor|yet)\b/i;
const count=s=>s.trim().split(/\s+/).filter(Boolean).length;

/* "apples, pears and oranges" -> "apples, pears, and oranges".
   Only short list-like pieces are touched, and never a sentence that opens with an
   introductory word or phrase ("However, he and she ..."): that comma is not a list. */
function serialComma(t){
    const parts=t.split(", ");
    if(parts.length<2)return t;
    if(INTRO.test(parts[0].trim()))return t;
    for(let k=1;k<parts.length;k++){
        const m=parts[k].match(/^(.+?)\s+(and|or)\s+(.+)$/i);
        if(!m||count(m[1])>3||count(m[3])>5)continue;
        if(k===1&&count(parts[0])>6)continue;
        let listy=true;
        for(let j=1;j<k;j++)if(count(parts[j])>3){listy=false;break;}
        if(!listy)continue;
        parts[k]=m[1]+", "+m[2]+" "+m[3];
    }
    return parts.join(", ");
}

/* the shared work of spoken() / spokenParts(): {lead, body}
   lead = a number that starts the sentence (or null), body = the rest, ready for the voice */
function run(text,opts){
    let t=String(text==null?"":text);
    if(!t)return {lead:null,body:t};
    if(!compiled)compile();
    const atEnd=!!(opts&&opts.end);
    t=superscripts(t).trim();
    let lead=null;
    const sp=splitLead(t);
    if(sp){lead=sp.num;t=sp.rest;}
    t=words(t);
    t=abbreviations(t);
    t=separators(t,atEnd);
    t=serialComma(t);
    t=t.replace(/\s+([,.!?])/g,"$1").replace(/\s+/g," ").trim();
    if(atEnd)t=t.replace(/\s*[,;:—–-]+$/,".");
    if(lead!==null)lead=separators(lead,false).replace(/\s+/g," ").trim();
    return {lead:lead,body:t};
}

/*
 * text : one sentence-sized piece, as readAloud.js cut it
 * opts : {end:true} when the piece is the last of its paragraph (it then always ends in a full stop)
 * returns the text to hand to the voice, as one string ("16. For God so loved ...")
 */
api.spoken=function(text,opts){
    const r=run(text,opts);
    if(r.lead===null)return r.body;
    return r.body?r.lead+". "+r.body:r.lead+".";
};

/*
 * Same, but as pieces: [{text, gap}]. A number that starts a sentence comes first, on its own, with
 * gap = api.gaps.number (milliseconds of real silence before the next piece); the rest follows.
 */
api.spokenParts=function(text,opts){
    const r=run(text,opts);
    if(r.lead===null)return [{text:r.body,gap:0}];
    const g=api.gaps&&api.gaps.number>0?api.gaps.number:0;
    if(!g||!r.body)return [{text:r.body?r.lead+". "+r.body:r.lead+".",gap:0}];
    return [{text:r.lead,gap:g},{text:r.body,gap:0}];
};

/* The last word before the voice: whatever came before, MMICJ is spelled and no colon, semicolon or dash
   is left in the text. Safe to run on text that was already processed (it changes nothing then). */
api.enforce=function(text){
    let t=String(text==null?"":text);
    if(!t)return t;
    if(!compiled)compile();
    t=words(t);
    t=sweep(t);
    return t.replace(/(\s*,){2,}/g,",").replace(/\s+([,.!?])/g,"$1").replace(/\s+/g," ").trim();
};

return api;

})();

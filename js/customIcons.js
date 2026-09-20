// js/customIcons.js
"use strict";

window.CustomIcons = {
  // buttonId -> filename in /assets/icons/
  map: {
    previousButton: "previous.png",
    nextButton: "next.png",
    rotateButton: "rotate.png",
    muteButton: "mute.png",
    // add more as you go
  },

  apply(){
    Object.entries(this.map).forEach(([buttonId, filename]) => {
      const button = document.getElementById(buttonId);
      if(!button) return;

      const path = "assets/icons/" + filename;
      const probe = new Image();

      probe.onload = () => {
        button.classList.add("hasCustomIcon");
        button.innerHTML = "";
        const img = document.createElement("img");
        img.src = path;
        img.alt = "";
        img.className = "customIcon";
        button.appendChild(img);
      };

      // No file at that path yet (or it 404s) -> silently keep the
      // existing SVG/glyph fallback already in the button. No error shown.
      probe.onerror = () => {};

      probe.src = path;
    });
  }
};
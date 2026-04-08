const crosshairState = {
  opacity: 1,
  imageSrc: "",
  image: null,
};

export function setCrosshairOptions({ opacity, imageSrc }) {
  if (typeof opacity === "number" && Number.isFinite(opacity)) {
    crosshairState.opacity = Math.max(0.1, Math.min(1, opacity));
  }

  if (typeof imageSrc === "string") {
    crosshairState.imageSrc = imageSrc;
    if (imageSrc) {
      const img = new Image();
      img.src = imageSrc;
      crosshairState.image = img;
    } else {
      crosshairState.image = null;
    }
  }
}

export function getCrosshairOptions() {
  return crosshairState;
}

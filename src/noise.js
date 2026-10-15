/* Static FM — the original 7-colour, dual-stereo noise generator (unchanged maths).
 * Blue → Green → Grey → White → Pink → Orange → Brown, blended by colorMix (0..1). */

function sfmMakeGenerator() {
  let blueLastL = 0, blueLastR = 0;
  let greenLowL = 0, greenLowR = 0;
  let greyStateL = 0, greyStateR = 0;
  let b0L = 0, b1L = 0, b2L = 0, b3L = 0, b4L = 0, b5L = 0, b6L = 0;
  let b0R = 0, b1R = 0, b2R = 0, b3R = 0, b4R = 0, b5R = 0, b6R = 0;
  let orangeStateL = 0, orangeStateR = 0;
  let brownStateL = 0, brownStateR = 0;
  const weights = new Float64Array(7);

  function computeWeights(colorMix) {
    const blendWidth = 0.25;
    let total = 0;
    for (let c = 0; c < 7; c++) {
      const d = Math.abs(colorMix - c / 6) / blendWidth;
      weights[c] = d < 1 ? Math.cos(d * Math.PI / 2) : 0;
      total += weights[c];
    }
    if (total > 0) for (let c = 0; c < 7; c++) weights[c] /= total;
  }

  return {
    process(outL, outR, n, colorMix) {
      computeWeights(colorMix);
      const w = weights;
      for (let i = 0; i < n; i++) {
        // LEFT
        const whiteL = Math.random() * 2 - 1;
        const blueL = (whiteL - blueLastL) * 1.5; blueLastL = whiteL;
        greenLowL = greenLowL * 0.95 + whiteL * 0.05;
        const greenL = (whiteL - greenLowL * 0.5) * 2;
        greyStateL = greyStateL * 0.98 + whiteL * 0.02;
        const greyL = whiteL * 0.7 + greyStateL * 0.3;
        b0L = 0.99886 * b0L + whiteL * 0.0555179;
        b1L = 0.99332 * b1L + whiteL * 0.0750759;
        b2L = 0.96900 * b2L + whiteL * 0.1538520;
        b3L = 0.86650 * b3L + whiteL * 0.3104856;
        b4L = 0.55000 * b4L + whiteL * 0.5329522;
        b5L = -0.7616 * b5L - whiteL * 0.0168980;
        const pinkL = (b0L + b1L + b2L + b3L + b4L + b5L + b6L + whiteL * 0.5362) * 0.11;
        b6L = whiteL * 0.115926;
        orangeStateL = orangeStateL * 0.995 + whiteL * 0.005;
        const orangeL = orangeStateL * 20;
        brownStateL = brownStateL * 0.997 + whiteL * 0.003;
        const brownL = brownStateL * 35;
        // RIGHT
        const whiteR = Math.random() * 2 - 1;
        const blueR = (whiteR - blueLastR) * 1.5; blueLastR = whiteR;
        greenLowR = greenLowR * 0.95 + whiteR * 0.05;
        const greenR = (whiteR - greenLowR * 0.5) * 2;
        greyStateR = greyStateR * 0.98 + whiteR * 0.02;
        const greyR = whiteR * 0.7 + greyStateR * 0.3;
        b0R = 0.99886 * b0R + whiteR * 0.0555179;
        b1R = 0.99332 * b1R + whiteR * 0.0750759;
        b2R = 0.96900 * b2R + whiteR * 0.1538520;
        b3R = 0.86650 * b3R + whiteR * 0.3104856;
        b4R = 0.55000 * b4R + whiteR * 0.5329522;
        b5R = -0.7616 * b5R - whiteR * 0.0168980;
        const pinkR = (b0R + b1R + b2R + b3R + b4R + b5R + b6R + whiteR * 0.5362) * 0.11;
        b6R = whiteR * 0.115926;
        orangeStateR = orangeStateR * 0.995 + whiteR * 0.005;
        const orangeR = orangeStateR * 20;
        brownStateR = brownStateR * 0.997 + whiteR * 0.003;
        const brownR = brownStateR * 35;

        let sL = blueL * w[0] + greenL * w[1] + greyL * w[2] + whiteL * w[3] + pinkL * w[4] + orangeL * w[5] + brownL * w[6];
        let sR = blueR * w[0] + greenR * w[1] + greyR * w[2] + whiteR * w[3] + pinkR * w[4] + orangeR * w[5] + brownR * w[6];
        sL *= 0.4; sR *= 0.4;
        outL[i] = sL > 1 ? 1 : sL < -1 ? -1 : sL;
        outR[i] = sR > 1 ? 1 : sR < -1 ? -1 : sR;
      }
    }
  };
}

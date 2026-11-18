// Corrections that turn the Autumn Hues colour table into an "identity" table, i.e. one that renders like the
// plain Canon style. Fitted from tripod photos of a colour chart (tools/research/fit-identity.ts); these are our
// own measurements, not Canon data. docs/M0-findings.md "Editable bases".

import type { LookParams } from './look-engine';

/** Applied in order to the Autumn Hues table for every base. */
export const IDENTITY_COMMON: readonly LookParams[] = [
  {
    "saturation": -0.1,
    "shadows": -0.086,
    "highlights": 0.0062,
    "contrast": 0,
    "bands": {
      "red": {
        "hue": 0,
        "sat": 0.1011,
        "light": 0
      },
      "orange": {
        "hue": 5.179,
        "sat": 0.0512,
        "light": 0.009
      },
      "yellow": {
        "hue": -4.4127,
        "sat": 0.0393,
        "light": 0.0013
      },
      "green": {
        "hue": 0.7663,
        "sat": 0.0095,
        "light": -0.0055
      },
      "aqua": {
        "hue": -1.2065,
        "sat": 0.04,
        "light": -0.0077
      },
      "blue": {
        "hue": -0.75,
        "sat": 0.0268,
        "light": -0.0039
      },
      "purple": {
        "hue": -0.9448,
        "sat": 0.0112,
        "light": 0
      },
      "magenta": {
        "hue": -0.293,
        "sat": 0.1088,
        "light": 0.0262
      }
    },
    "shadowTint": {
      "hue": 200,
      "amount": 0
    },
    "highlightTint": {
      "hue": 60,
      "amount": 0
    }
  },
  {
    "saturation": -0.05,
    "shadows": 0.0048,
    "highlights": 0.0495,
    "contrast": -0.0378,
    "bands": {
      "red": {
        "hue": 0,
        "sat": 0.0556,
        "light": 0
      },
      "orange": {
        "hue": -0.1907,
        "sat": 0.0498,
        "light": 0.0049
      },
      "yellow": {
        "hue": 0.0992,
        "sat": -0.0341,
        "light": 0.009
      },
      "green": {
        "hue": 0.3738,
        "sat": 0.0095,
        "light": 0.0015
      },
      "aqua": {
        "hue": -2.0117,
        "sat": 0.0645,
        "light": -0.0039
      },
      "blue": {
        "hue": 0,
        "sat": 0.0244,
        "light": -0.01
      },
      "purple": {
        "hue": 1.0742,
        "sat": 0.025,
        "light": 0
      },
      "magenta": {
        "hue": 0.7858,
        "sat": 0.021,
        "light": 0.003
      }
    },
    "shadowTint": {
      "hue": 200,
      "amount": 0
    },
    "highlightTint": {
      "hue": 60,
      "amount": 0
    }
  }
];

/** Extra corrections for bases whose built-in rendering differs from Standard's. */
export const IDENTITY_PER_BASE: Readonly<Record<string, readonly LookParams[]>> = {
  "portrait": [
    {
      "saturation": 0.3312,
      "shadows": 0.0378,
      "highlights": -0.1841,
      "contrast": 0,
      "bands": {
        "red": {
          "hue": -0.5475,
          "sat": 0.0541,
          "light": 0.0385
        },
        "orange": {
          "hue": -9.2695,
          "sat": -0.0306,
          "light": 0.027
        },
        "yellow": {
          "hue": 0.5,
          "sat": -0.11,
          "light": 0.02
        },
        "green": {
          "hue": -3.2188,
          "sat": 0.1539,
          "light": 0.0163
        },
        "aqua": {
          "hue": -14.75,
          "sat": 0.0598,
          "light": -0.0451
        },
        "blue": {
          "hue": -6.9688,
          "sat": -0.0407,
          "light": 0.0139
        },
        "purple": {
          "hue": 3,
          "sat": -0.2156,
          "light": 0.0663
        },
        "magenta": {
          "hue": 19.9331,
          "sat": -0.1557,
          "light": 0.0613
        }
      },
      "shadowTint": {
        "hue": 200,
        "amount": 0
      },
      "highlightTint": {
        "hue": 60,
        "amount": 0
      }
    },
    {
      "saturation": 0.05,
      "shadows": 0.0378,
      "highlights": -0.0065,
      "contrast": 0,
      "bands": {
        "red": {
          "hue": -1.6948,
          "sat": -0.0195,
          "light": -0.0062
        },
        "orange": {
          "hue": -0.293,
          "sat": -0.0552,
          "light": 0.01
        },
        "yellow": {
          "hue": -1.5117,
          "sat": -0.0136,
          "light": 0.0148
        },
        "green": {
          "hue": -0.7812,
          "sat": 0.0156,
          "light": -0.0061
        },
        "aqua": {
          "hue": -2.75,
          "sat": 0.0302,
          "light": -0.02
        },
        "blue": {
          "hue": -2.4883,
          "sat": 0.0191,
          "light": -0.0125
        },
        "purple": {
          "hue": -2.2734,
          "sat": -0.0244,
          "light": 0.02
        },
        "magenta": {
          "hue": 0,
          "sat": -0.08,
          "light": 0.0039
        }
      },
      "shadowTint": {
        "hue": 200,
        "amount": 0
      },
      "highlightTint": {
        "hue": 60,
        "amount": 0
      }
    }
  ],
  "landscape": [
    {
      "saturation": 0.4,
      "shadows": -0.0048,
      "highlights": -0.0492,
      "contrast": 0,
      "bands": {
        "red": {
          "hue": 3.209,
          "sat": -0.0601,
          "light": 0.0315
        },
        "orange": {
          "hue": -11.0234,
          "sat": -0.1402,
          "light": 0.05
        },
        "yellow": {
          "hue": 4,
          "sat": -0.2001,
          "light": 0.0064
        },
        "green": {
          "hue": 0.2975,
          "sat": 0.0183,
          "light": 0.0278
        },
        "aqua": {
          "hue": 15.2188,
          "sat": 0.115,
          "light": -0.02
        },
        "blue": {
          "hue": 0.2617,
          "sat": 0.2617,
          "light": -0.0225
        },
        "purple": {
          "hue": -5.9407,
          "sat": -0.1106,
          "light": 0.0286
        },
        "magenta": {
          "hue": 13.25,
          "sat": -0.2389,
          "light": 0.0438
        }
      },
      "shadowTint": {
        "hue": 200,
        "amount": 0
      },
      "highlightTint": {
        "hue": 60,
        "amount": 0
      }
    }
  ],
  "faithful": [
    {
      "saturation": 0.1313,
      "shadows": -0.0424,
      "highlights": -0.0238,
      "contrast": -0.05,
      "bands": {
        "red": {
          "hue": -1.5312,
          "sat": -0.034,
          "light": 0.02
        },
        "orange": {
          "hue": -9.9095,
          "sat": 0.0345,
          "light": 0.0062
        },
        "yellow": {
          "hue": 0.2739,
          "sat": -0.0312,
          "light": 0.0038
        },
        "green": {
          "hue": 2,
          "sat": 0.0432,
          "light": -0.01
        },
        "aqua": {
          "hue": -6.0593,
          "sat": 0.526,
          "light": -0.02
        },
        "blue": {
          "hue": -14.3242,
          "sat": -0.0502,
          "light": -0.0115
        },
        "purple": {
          "hue": -4.75,
          "sat": -0.0288,
          "light": 0.0139
        },
        "magenta": {
          "hue": 0,
          "sat": -0.025,
          "light": 0.011
        }
      },
      "shadowTint": {
        "hue": 200,
        "amount": 0
      },
      "highlightTint": {
        "hue": 60,
        "amount": 0
      }
    }
  ],
  "finedetail": [
    {
      "saturation": 0.05,
      "shadows": 0.0378,
      "highlights": 0.0305,
      "contrast": 0,
      "bands": {
        "red": {
          "hue": -0.9448,
          "sat": -0.0682,
          "light": -0.0061
        },
        "orange": {
          "hue": -0.1907,
          "sat": -0.0438,
          "light": -0.0015
        },
        "yellow": {
          "hue": 4.0239,
          "sat": 0.0059,
          "light": -0.0061
        },
        "green": {
          "hue": 0,
          "sat": 0.04,
          "light": 0.0062
        },
        "aqua": {
          "hue": -0.1907,
          "sat": -0.0494,
          "light": -0.009
        },
        "blue": {
          "hue": 0.5905,
          "sat": -0.0004,
          "light": -0.001
        },
        "purple": {
          "hue": -4,
          "sat": -0.0146,
          "light": 0.0049
        },
        "magenta": {
          "hue": -2,
          "sat": -0.0556,
          "light": 0
        }
      },
      "shadowTint": {
        "hue": 200,
        "amount": 0
      },
      "highlightTint": {
        "hue": 60,
        "amount": 0
      }
    }
  ]
};

/** Measured mean ΔE between "identity table + base" and the plain Canon style (photo noise floor ≈ 1.1). */
export const IDENTITY_QUALITY: Readonly<Record<string, number>> = {"standard": 1.6, "neutral": 2.1, "faithful": 2.2, "finedetail": 2.6, "landscape": 4.2, "portrait": 4.8, "monochrome": 0.1};

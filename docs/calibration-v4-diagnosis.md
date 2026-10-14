## v4 per-factor diagnosis (500 competent XIs, exact expectation)

Population: overall 86.5 · FIT 91.3 · out of position 0.57

| factor changed | overall | FIT | OOP | exp. pts | ≥100 | ≥105 | ≥110 | ≥112 | 114 |
|---|---|---|---|---|---|---|---|---|---|
| **v4 as shipped** (adaptive Director, protection on) | 86.5 | 91.3 | 0.57 | 90.7 | 15.4% | 3.9% | 0.38% | 0.11% | 0.02% |
| *draft quality* |||||||||| 
| naive draw (no Director), same seeds | 85.6 | 85.2 | 1.30 | 85.0 | 5.9% | 1.2% | 0.10% | 0.03% | 4.1e-3% |
| Director without solvability protection | 86.5 | 91.6 | 0.59 | 90.8 | 15.5% | 3.9% | 0.39% | 0.11% | 0.02% |
| hindsight ceiling (beam search, 150 draws) | 87.4 | 95.9 | 0.22 | 96.9 | 36.8% | 11.9% | 1.5% | 0.47% | 0.09% |
| *positional / FIT* |||||||||| 
| OPTIMISE XI applied after the draft | 86.6 | 92.0 | 0.52 | 92.5 | 20.5% | 5.8% | 0.68% | 0.21% | 0.04% |
| FIT penalty halved | 86.5 | 91.3 | 0.57 | 92.3 | 18.9% | 5.0% | 0.53% | 0.15% | 0.03% |
| FIT penalty removed (FIT = 100) | 86.5 | 91.3 | 0.57 | 93.8 | 23.6% | 6.7% | 0.77% | 0.23% | 0.04% |
| *opponents* |||||||||| 
| opponents −2 (weaker league) | 86.5 | 91.3 | 0.57 | 97.0 | 40.0% | 15.3% | 2.5% | 0.86% | 0.18% |
| opponents +2 (stronger league) | 86.5 | 91.3 | 0.57 | 83.3 | 3.4% | 0.53% | 0.03% | 6.8e-3% | 9.1e-4% |
| *expected goals* |||||||||| 
| goal scale ×0.9 (base 0.99) | 86.5 | 91.3 | 0.57 | 89.2 | 11.3% | 2.5% | 0.22% | 0.06% | 8.7e-3% |
| goal scale ×1.15 (base 1.27) | 86.5 | 91.3 | 0.57 | 92.5 | 21.3% | 6.2% | 0.72% | 0.22% | 0.04% |
| steeper strength mapping (K 0.085) | 86.5 | 91.3 | 0.57 | 93.6 | 25.5% | 8.1% | 1.1% | 0.34% | 0.07% |
| *variance* |||||||||| 
| no form swing (amp 0) | 86.5 | 91.3 | 0.57 | 90.8 | 15.7% | 4.0% | 0.40% | 0.11% | 0.02% |
| double form swing (amp 3) | 86.5 | 91.3 | 0.57 | 90.4 | 14.3% | 3.5% | 0.34% | 0.09% | 0.02% |
| no elite control | 86.5 | 91.3 | 0.57 | 90.7 | 15.2% | 3.7% | 0.35% | 0.10% | 0.02% |

(266s)


# ERA XI — candidate diversity audit (V1.7)

`node scripts/run-ts.mjs scripts/diversity-audit.ts <drafts> <engine>` — 3,000 drafts across Classic ×3,
Era Lock, Nations, Cult XI and Champions, 7 formations, drafted by the competent bot. Counts every player
*seen* in an offer (once per draft) and every pick.

## Finding (engine v4) and the fix (engine v5)

The v4 Director weighted every PlayerEra independently. An icon with several versions (Cristiano Ronaldo:
Manchester United, Real Madrid, Portugal…) therefore had several independent chances per draft, so the
same four or five names appeared in one draft in six: repetition that players notice long before any
statistic would. v5 divides each option's draw weight by the number of versions of its identity
(`identityDamping`), including the tailored option of rounds 5–11. Squads, clubs and eras are unchanged;
only which member of a drawn squad is shown moves. v2–v4 links keep their own draw and replay exactly.

| measure | v4 | v5 |
|---|---|---|
| players offered at least once (of 2,312) | 2,298 (99.4%) | 2,302 (99.6%) |
| players picked at least once | 2,034 | 2,072 |
| top 1% of players, share of "seen" events | 6.4% | 5.3% |
| top 5% of players, share of "seen" events | 20.6% | 17.9% |
| team eras drawn (of 214) | 214 | 214 |
| options rated 95+ (dataset share 1.8%) | 4.0% | 3.7% |
| options rated < 85 (dataset share 57.5%) | 38.7% | 40.7% |
| Cristiano Ronaldo offered in | 18.4% of drafts | 13.9% |
| Messi | 16.0% | 12.5% |
| Maldini | 17.8% | 13.6% |
| Henry | 11.1% | 5.6% |
| Zidane | 14.2% | 12.9% |

Stars remain over-represented relative to the dataset **by design**: the base offer always carries a
"superstar" slot, which is what makes the star-vs-fit decision exist. What was not by design (a handful of
multi-version icons crowding every draft) is what v5 removes. Calibration impact of the change is small
and documented in CALIBRATION.md §7.

Roles are shown in proportion to the dataset (largest gap: stoppers 12.5% shown vs 13.3% in the data;
ball-playing CBs 6.6% vs 5.1%, because the Director favours a different job per option).

## Engine v6 (V1.8, 20 world eras added)

99.2% of 2,597 players offered at least once; top 1% of players take 5.4% of "seen" events; Cristiano 14.5% of drafts, Messi 11.7%, Maldini 13.3%. The new eras are drawn like the others (all 234 eras appear).

## Full outputs

### Engine v6 (shipped)

#### Diversity audit (engine v6, 3000 drafts: classic ×3, eralock, nations, cult, champions; 7 formations)

- Distinct players offered at least once: 2576 of 2597 (99.2%); picked at least once: 2265.
- Concentration: the top 1% of players take 5.4% of all "player seen in a draft" events, the top 5% take 18.9% (uniform would be 1% / 5%).
- Distinct team eras drawn: 234 of 234.

#### Rating tiers: share of options shown vs share of the dataset

| tier | options shown | dataset |
|---|---|---|
| 95+ | 3.4% | 1.6% |
| 90–94 | 15.9% | 8.6% |
| 85–89 | 38.0% | 29.0% |
| <85 | 42.7% | 60.8% |

#### Most frequently offered players (share of drafts in which they appear at least once)

| player | offered | picked (competent) |
|---|---|---|
| cristiano-ronaldo | 14.5% | 6.0% |
| maldini | 13.3% | 5.8% |
| van-basten | 12.2% | 3.7% |
| zidane | 12.0% | 3.2% |
| messi | 11.7% | 4.5% |
| baresi | 10.4% | 6.4% |
| kante | 9.4% | 4.3% |
| deco | 9.1% | 2.0% |
| cruyff | 8.9% | 3.6% |
| gullit | 8.9% | 2.0% |
| ronaldo | 8.8% | 2.5% |
| iniesta | 8.7% | 2.4% |
| belodedici | 8.7% | 4.9% |
| roberto-carlos | 8.6% | 4.2% |
| drogba | 8.4% | 2.3% |
| ramos | 8.2% | 2.2% |
| xavi | 8.1% | 4.2% |
| koeman | 8.0% | 5.3% |
| romario | 7.7% | 2.1% |
| weah | 7.5% | 2.3% |

#### The usual suspects

| player | offered | picked |
|---|---|---|
| messi | 11.7% | 4.5% |
| cristiano-ronaldo | 14.5% | 6.0% |
| zidane | 12.0% | 3.2% |
| ronaldinho | 6.6% | 1.9% |
| henry | 5.5% | 1.9% |
| maradona | 6.8% | 3.2% |
| pele | 4.5% | 1.9% |
| cruyff | 8.9% | 3.6% |

#### Roles: share of options shown vs share of the dataset

| role | shown | dataset |
|---|---|---|
| STP | 12.7% | 13.5% |
| B2B | 7.4% | 9.3% |
| WNG | 6.8% | 7.8% |
| GK | 7.1% | 7.3% |
| FB | 7.4% | 7.3% |
| PM | 8.6% | 7.2% |
| DFB | 6.6% | 7.1% |
| PCH | 6.4% | 6.6% |
| DLP | 5.9% | 5.3% |
| BW | 4.1% | 5.3% |
| BPD | 6.4% | 4.9% |
| CF | 5.8% | 4.8% |
| IF | 5.9% | 4.7% |
| ANC | 1.9% | 2.2% |
| TM | 2.0% | 2.1% |
| WB | 1.0% | 1.2% |
| SK | 1.5% | 1.1% |
| PRS | 0.7% | 1.1% |
| F9 | 1.6% | 1.1% |

#### Most drawn team eras (share of drafts)

Red Star Belgrade 1989–1991 9.6% · Feyenoord 1969–1971 9.2% · Manchester United 1965–1968 9.1% · Inter 1963–1966 9.1% · Juventus 1994–1998 9.1% · Ajax 1970–1973 9.0% · PSG 2023–2025 8.9% · Chelsea 2011–2012 8.8% · Ajax 1994–1996 8.7% · Porto 2003–2004 8.6%

(50s)



### Engine v5

#### Diversity audit (engine v5, 3000 drafts: classic ×3, eralock, nations, cult, champions; 7 formations)

- Distinct players offered at least once: 2302 of 2312 (99.6%); picked at least once: 2072.
- Concentration: the top 1% of players take 5.3% of all "player seen in a draft" events, the top 5% take 17.9% (uniform would be 1% / 5%).
- Distinct team eras drawn: 214 of 214.

#### Rating tiers: share of options shown vs share of the dataset

| tier | options shown | dataset |
|---|---|---|
| 95+ | 3.7% | 1.8% |
| 90–94 | 16.3% | 9.4% |
| 85–89 | 39.3% | 31.3% |
| <85 | 40.7% | 57.5% |

#### Most frequently offered players (share of drafts in which they appear at least once)

| player | offered | picked (competent) |
|---|---|---|
| cristiano-ronaldo | 13.9% | 6.5% |
| maldini | 13.6% | 6.1% |
| van-basten | 13.2% | 4.6% |
| zidane | 12.9% | 3.8% |
| messi | 12.5% | 5.9% |
| baresi | 12.1% | 7.0% |
| kante | 10.5% | 5.8% |
| deco | 10.0% | 2.1% |
| romario | 9.2% | 2.7% |
| gullit | 9.1% | 1.7% |
| beckenbauer | 9.1% | 5.8% |
| iniesta | 8.9% | 2.5% |
| xavi | 8.7% | 4.4% |
| koeman | 8.7% | 5.3% |
| ramos | 8.7% | 2.4% |
| ronaldo | 8.5% | 2.3% |
| roberto-carlos | 8.2% | 4.3% |
| cruyff | 8.2% | 3.7% |
| gerd-muller | 8.1% | 2.4% |
| matthaus | 7.9% | 4.8% |

#### The usual suspects

| player | offered | picked |
|---|---|---|
| messi | 12.5% | 5.9% |
| cristiano-ronaldo | 13.9% | 6.5% |
| zidane | 12.9% | 3.8% |
| ronaldinho | 6.5% | 2.0% |
| henry | 5.6% | 1.2% |
| maradona | 7.4% | 3.4% |
| pele | 5.2% | 2.2% |
| cruyff | 8.2% | 3.7% |

#### Roles: share of options shown vs share of the dataset

| role | shown | dataset |
|---|---|---|
| STP | 12.5% | 13.3% |
| B2B | 7.5% | 9.0% |
| WNG | 6.7% | 7.9% |
| FB | 7.4% | 7.5% |
| PM | 8.5% | 7.2% |
| DFB | 6.6% | 7.2% |
| GK | 7.1% | 6.9% |
| PCH | 6.6% | 6.4% |
| DLP | 6.0% | 5.4% |
| BW | 4.2% | 5.3% |
| BPD | 6.6% | 5.1% |
| CF | 5.8% | 4.8% |
| IF | 5.8% | 4.7% |
| ANC | 1.9% | 2.3% |
| TM | 1.9% | 2.1% |
| SK | 1.5% | 1.3% |
| F9 | 1.6% | 1.2% |
| PRS | 0.8% | 1.1% |
| WB | 1.1% | 1.1% |

#### Most drawn team eras (share of drafts)

Bayern Munich 2019–2024 9.2% · Chelsea 2020–2022 8.9% · Marseille 1990–1993 8.9% · Hamburg 1981–1983 8.8% · Liverpool 1983–1986 8.7% · Porto 1986–1988 8.6% · Manchester City 2017–2023 8.5% · Juventus 1994–1998 8.5% · Nottingham Forest 1978–1980 8.4% · Aston Villa 1980–1982 8.4%

(41s)


### Engine v4 (before)

#### Diversity audit (engine v4, 3000 drafts: classic ×3, eralock, nations, cult, champions; 7 formations)

- Distinct players offered at least once: 2298 of 2312 (99.4%); picked at least once: 2034.
- Concentration: the top 1% of players take 6.4% of all "player seen in a draft" events, the top 5% take 20.6% (uniform would be 1% / 5%).
- Distinct team eras drawn: 214 of 214.

#### Rating tiers: share of options shown vs share of the dataset

| tier | options shown | dataset |
|---|---|---|
| 95+ | 4.0% | 1.8% |
| 90–94 | 17.2% | 9.4% |
| 85–89 | 40.1% | 31.3% |
| <85 | 38.7% | 57.5% |

#### Most frequently offered players (share of drafts in which they appear at least once)

| player | offered | picked (competent) |
|---|---|---|
| cristiano-ronaldo | 18.4% | 7.1% |
| maldini | 17.8% | 7.2% |
| messi | 16.0% | 7.1% |
| baresi | 14.8% | 9.0% |
| zidane | 14.2% | 3.3% |
| kante | 13.4% | 7.0% |
| van-basten | 13.2% | 4.0% |
| deco | 12.2% | 2.5% |
| gullit | 12.0% | 2.0% |
| roberto-carlos | 11.7% | 5.3% |
| henry | 11.1% | 3.2% |
| romario | 11.1% | 2.8% |
| koeman | 10.9% | 6.4% |
| matthaus | 10.6% | 5.7% |
| belodedici | 9.9% | 4.5% |
| cafu | 9.9% | 4.6% |
| ronaldo | 9.9% | 3.2% |
| ferdinand | 9.7% | 5.0% |
| ibrahimovic | 9.2% | 2.7% |
| cruyff | 9.2% | 3.8% |

#### The usual suspects

| player | offered | picked |
|---|---|---|
| messi | 16.0% | 7.1% |
| cristiano-ronaldo | 18.4% | 7.1% |
| zidane | 14.2% | 3.3% |
| ronaldinho | 6.5% | 1.9% |
| henry | 11.1% | 3.2% |
| maradona | 8.5% | 4.3% |
| pele | 6.5% | 2.6% |
| cruyff | 9.2% | 3.8% |

#### Roles: share of options shown vs share of the dataset

| role | shown | dataset |
|---|---|---|
| STP | 11.9% | 13.3% |
| B2B | 7.4% | 9.0% |
| WNG | 6.4% | 7.9% |
| FB | 7.4% | 7.5% |
| PM | 8.5% | 7.2% |
| DFB | 6.7% | 7.2% |
| GK | 7.1% | 6.9% |
| PCH | 6.6% | 6.4% |
| DLP | 6.1% | 5.4% |
| BW | 4.3% | 5.3% |
| BPD | 7.0% | 5.1% |
| CF | 6.1% | 4.8% |
| IF | 5.7% | 4.7% |
| ANC | 1.9% | 2.3% |
| TM | 1.8% | 2.1% |
| SK | 1.6% | 1.3% |
| F9 | 1.5% | 1.2% |
| PRS | 0.8% | 1.1% |
| WB | 1.2% | 1.1% |

#### Most drawn team eras (share of drafts)

Bayern Munich 1973–1976 8.9% · Aston Villa 1980–1982 8.9% · Ajax 1970–1973 8.8% · Nottingham Forest 1978–1980 8.7% · PSG 2023–2025 8.7% · Chelsea 2011–2012 8.6% · Manchester United 1965–1968 8.6% · Barcelona 2004–2006 8.5% · Bayern Munich 2019–2024 8.5% · Inter 2008–2010 8.5%

(40s)



## V2.0: engine v7, 10,000 drafts (`npm run audit:diversity -- 7`)

Engine v7 adds 49 team eras (Britain, Iberia, Italy/Germany, France/Low Countries, Eastern Europe/Turkey,
the Americas/Africa): **283 eras, 4,024 PlayerEras, 3,100 players**. Same Director, same damping; v2–v6
links keep their own pool. v6 measured on the same 10,000-draft protocol for comparison.

| measure | v6 (234 eras) | v7 (283 eras) |
|---|---|---|
| players offered at least once | 2,592 of 2,597 | 3,094 of 3,100 (99.8%) |
| PlayerEras offered at least once | 3,331 of 3,336 | 4,016 of 4,024 (99.8%) |
| top 1% / top 5% of players, share of "seen" events | 6.1% / 21.3% | 5.8% / 19.7% |
| overlap with the previous game (players already met) | 2.6% | 2.3% |
| consecutive pairs with ≥20% overlap | 7 of 9,999 | 2 of 9,999 |
| distinct players met after 50 / 200 / 1,000 games | 1,235 / 2,121 / 2,506 | 1,285 / 2,374 / 2,968 |
| most-offered identity (share of drafts) | — | Van Basten 13.0% |
| most-offered PlayerEra | — | Litmanen, Ajax 1994–95: 5.8% |
| teams drawn | 123 | 139 |
| nationalities among options | 84 | 86 |

**Flags.** Thresholds: a PlayerEra offered in more than 10% of drafts, or an identity in more than 15%.
Neither fires on v7. Closest: Van Basten 13.0% (two versions, AC Milan and Netherlands), Maldini 12.3%,
Cristiano Ronaldo and Zidane 11.2%: icons with several versions, already divided by the v5 damping.

**What did not move.** Club concentration is structural: Real Madrid is in 41% of drafts, Barcelona 38%,
Liverpool 36%. The six big clubs hold many eras each, and a draft samples ~33 eras. Periods are balanced
(12.6–20.3% each); the 2020s are the thinnest (12.6%) because they have the fewest eras.

**Geography (honest).** By the team's country, Europe is 77% of PlayerEras, South America 14%, Africa 4.5%,
Asia/Oceania 2.7%, North/Central America 2.0% (`docs/data-quality.md`). National teams are first-class
(80 national eras), but club football outside Europe and South America remains thin.

### Raw output: diversity audit (engine v7, 10000 drafts: classic ×3, eralock, nations, cult, champions; 7 formations)

- Distinct players offered at least once: 3094 of 3100 (99.8%); picked at least once: 2884.
- Concentration: the top 1% of players take 5.8% of all "player seen in a draft" events, the top 5% take 19.7% (uniform would be 1% / 5%).
- Distinct team eras drawn: 283 of 283.

#### Rating tiers: share of options shown vs share of the dataset

| tier | options shown | dataset |
|---|---|---|
| 95+ | 3.1% | 1.5% |
| 90–94 | 15.6% | 8.3% |
| 85–89 | 36.9% | 27.9% |
| <85 | 44.4% | 62.4% |

#### Most frequently offered players (share of drafts in which they appear at least once)

| player | offered | picked (competent) |
|---|---|---|
| van-basten | 13.0% | 4.1% |
| maldini | 12.3% | 5.8% |
| cristiano-ronaldo | 11.2% | 4.8% |
| zidane | 11.2% | 3.1% |
| messi | 10.4% | 4.3% |
| baresi | 10.3% | 6.0% |
| roberto-carlos | 8.9% | 4.8% |
| gullit | 8.7% | 1.7% |
| deco | 8.4% | 1.7% |
| kante | 8.3% | 4.6% |
| cruyff | 8.3% | 4.3% |
| beckenbauer | 8.0% | 5.5% |
| koeman | 7.9% | 4.6% |
| romario | 7.8% | 1.8% |
| xavi | 7.7% | 3.4% |
| ronaldo | 7.5% | 2.4% |
| iniesta | 7.5% | 2.0% |
| hagi | 7.4% | 1.1% |
| thiago-silva | 7.3% | 3.6% |
| matthaus | 7.1% | 3.6% |

#### The usual suspects

| player | offered | picked |
|---|---|---|
| messi | 10.4% | 4.3% |
| cristiano-ronaldo | 11.2% | 4.8% |
| zidane | 11.2% | 3.1% |
| ronaldinho | 6.5% | 1.9% |
| henry | 5.5% | 1.8% |
| maradona | 5.8% | 2.7% |
| pele | 3.4% | 1.6% |
| cruyff | 8.3% | 4.3% |

#### Roles: share of options shown vs share of the dataset

| role | shown | dataset |
|---|---|---|
| STP | 12.7% | 13.7% |
| B2B | 7.6% | 9.7% |
| WNG | 7.0% | 8.4% |
| GK | 7.2% | 7.6% |
| PM | 8.8% | 7.3% |
| FB | 7.4% | 7.1% |
| DFB | 6.6% | 7.1% |
| PCH | 6.8% | 6.7% |
| BW | 3.9% | 5.0% |
| DLP | 5.5% | 4.8% |
| CF | 6.1% | 4.8% |
| BPD | 6.5% | 4.8% |
| IF | 5.5% | 4.2% |
| ANC | 2.0% | 2.4% |
| TM | 1.8% | 2.1% |
| F9 | 1.5% | 1.1% |
| SK | 1.4% | 1.1% |
| WB | 1.0% | 1.0% |
| PRS | 0.7% | 1.0% |

#### Most drawn team eras (share of drafts)

Manchester United 2006–2009 7.7% · Hamburg 1981–1983 7.5% · Red Star Belgrade 1989–1991 7.5% · Barcelona 2004–2006 7.4% · Chelsea 2020–2022 7.4% · Manchester United 1965–1968 7.3% · Steaua 1985–1989 7.3% · Manchester City 2017–2023 7.3% · AC Milan 1989–1994 7.2% · Manchester United 1998–2001 7.2%

#### Coverage & repetition

- Distinct PlayerEras offered: 4016 of 4024 (99.8%).
- Consecutive games: on average 2.3% of the players met in a draft were already met in the previous one (2 of 9999 pairs ≥ 20%).
- Discovery curve (distinct players met by one player after n games): 10 → 389 · 25 → 830 · 50 → 1285 · 100 → 1865 · 200 → 2374 · 500 → 2815 · 1000 → 2968.
- Repetition flags: PlayerEras offered in >10% of drafts: none; identities offered in >15% of drafts: none.

#### Top 25 PlayerEras (share of drafts in which offered)

ajax-1994:litmanen 5.8% · ac-milan-1989:van-basten 5.7% · inter-2008:maicon 5.5% · barcelona-2004:ronaldinho 5.4% · juventus-1982:platini 5.4% · ac-milan-1962:rivera 5.3% · bayern-2019:kimmich 5.3% · feyenoord-1969:rinus-israel 5.2% · real-madrid-1996:redondo 5.2% · bayern-1999:elber 5.1% · bayern-1999:effenberg 5.1% · hamburg-1981:kaltz 5.1% · ajax-1970:cruyff 5.0% · man-city-2017:haaland 5.0% · liverpool-2004:gerrard 4.9% · benfica-1960:eusebio 4.9% · bayern-1973:beckenbauer 4.9% · psg-2023:vitinha 4.8% · real-madrid-1956:di-stefano 4.7% · dortmund-1995:sammer 4.7% · inter-1963:facchetti 4.7% · man-united-1965:bobby-charlton 4.7% · ac-milan-1994:weah 4.6% · dortmund-1995:chapuisat 4.6% · celtic-1966:jimmy-johnstone 4.6%

#### Clubs & nations (139 teams drawn)

Most frequent teams (share of drafts): Real Madrid 41.0% · Barcelona 38.0% · Liverpool 36.0% · AC Milan 34.6% · Bayern Munich 27.0% · Manchester United 26.5% · Juventus 26.1% · Inter 24.0% · Arsenal 23.4% · Chelsea 20.4% · Porto 20.2% · Ajax 20.0%

Players' nationalities (share of options): BRA 9.6% · ESP 9.2% · ENG 8.8% · ITA 8.7% · GER 8.0% · FRA 7.8% · ARG 5.9% · NED 5.1% · POR 4.3% · SCO 3.4% · URU 2.0% · BEL 1.4% · DEN 1.3% · YUG 1.2% · ROU 1.1% · 86 nationalities in total

Periods (share of options): pre1980 20.3% · 1990s 18.3% · 2000s 16.8% · 1980s 16.0% · 2010s 16.0% · 2020s 12.6%

Natural positions (share of options): CB 19.2% · ST 16.7% · CM 13.0% · GK 8.6% · AM 8.5% · RB 7.2% · LB 7.1% · DM 6.2% · LW 5.5% · RW 4.8% · RM 1.5% · LM 0.9% · LWB 0.4% · RWB 0.3%





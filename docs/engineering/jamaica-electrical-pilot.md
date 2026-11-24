# Jamaica electrical pilot basis

**Status:** Pilot / To verify. This reference is a source index and project-start basis, not a claim of full code compliance.

## Jamaican sources

- The [Jamaica Trade Portal electrical standards catalogue](https://www.jamaicatradeportal.gov.jm/en-gb/site/display/849) lists JS 21:1992, *Electrical installations*, as mandatory and directs users to read JS 20:1987, *Panelboards and panelboard enclosures*, with it.
- The [2023 Jamaica Building Code](https://codes.iccsafe.org/content/JAMBC2023P1/index) includes Chapter 27, Electrical; the publisher’s code overview says that chapter references the National Electrical Code (NEC). The 2023 Jamaica Small Building/Residential Code describes its residential electrical provisions as based on NFPA 70:2017.
- The [Electricity (Electrical Work, Registration and Licensing) Regulations, 2020](https://jamger.gov.jm/wp-content/uploads/2021/10/The-Electricity-Electrical-Work-Registration-and-Licensing-Regulations-2020.pdf) require electrical work to be done by an appropriately registered electrician or supervised assistant and in accordance with the applicable Specification.
- The [OUR Jamaica Electricity Sector Book of Codes](https://our.org.jm/wp-content/uploads/2021/01/electricity_act_-_jamaica_electricity_book_of_codes_-_clean.pdf), Supply Code SC 2.1, declares 50 Hz and lists 110/220 V single-phase, 220/110 V three-phase, and 415/240 V three-phase arrangements. It gives availability conditions for 415/240 V service; confirm a project’s actual service with JPS.

## What the app includes

The Standards / New project reference list now has **Jamaica (JS 21 / Jamaica Building Code)** first, plus a separate **JPS 415/240 V, three-phase service** set. The general Jamaica set records the 50 Hz basis, code references, licensing source, and supply arrangements. It does not reproduce copyrighted JS 21 or NFPA tables or invent local current-rating, breaker, RCD, or voltage-drop limits.

## Engineering boundary

The current calculation model stores phase-to-phase voltage and derives phase-to-neutral voltage as `U/√3`. That represents 415/240 V three-phase service closely. It does not represent Jamaica’s 110/220 V split-phase topology or its 220/110 V three-phase relation exactly. The Jamaica reference therefore leaves voltage unset; the separate 415/240 V set is marked **To verify**, and New project warns the engineer to confirm the JPS service before calculating.

Before an issued design, an engineer must confirm the current Jamaican Specification, the licensed copy and amendments of JS 21 / the NEC basis, JPS supply conditions, and GEI requirements. A full local cable and protection database still needs licensed source data and an engineering review.

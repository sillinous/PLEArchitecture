# PLE Platform — Holistic Metamodel Specification

**Version:** 2.0  
**Status:** Active  
**Authors:** Travis Sillio, Claude (Anthropic)  
**Repository:** https://github.com/sillinous/PLEArchitecture  

---

## Overview

This document specifies the information architecture and metamodel for the Post-Labor Economics platform. A metamodel defines the categories of things that can exist in the system and the categories of relationships that can hold between them — it is the ontology of the ontology.

The PLE metamodel spans four layers:

```
Layer 4 — EPISTEMOLOGY    (How we know: Evidence, Confidence, Provenance)
Layer 3 — ARCHITECTURE    (How we organize: Frameworks, Models, Principles)
Layer 2 — THEORY          (What we think: Concepts, Mechanisms, Tensions)
Layer 1 — PRAXIS          (What we do: Interventions, Projects, Outcomes)
```

Each layer has distinct entity types with typed relationships flowing both within and across layers.

---

## Part I — Entity Type Taxonomy

### 1.1 THEORY Layer

#### `concept`
A theoretical construct in the PLE intellectual tradition. Concepts are the building blocks of the framework — they can be problems, solutions, phenomena, or analytical lenses.

**Sub-types:**
- `phenomenon` — Something that exists and must be explained (Laborism, Technological Unemployment, Care Poverty)
- `mechanism` — A causal or structural process (Market Pricing, Collective Ownership, Algorithmic Allocation)
- `proposal` — A normative claim about what should be done (UBI, Robot Tax, Data Dividends)
- `critique` — A challenge to an existing idea (Anti-Laborism, Degrowth, Post-Scarcity skepticism)
- `synthesis` — A concept that bridges multiple traditions (Latent Value Network, Solidarity Economy)

**Key attributes:**
- `maturity` — embryonic | developing | established | canonical
- `confidence` — speculative | contested | supported | consensus
- `domain` — economic | political | social | technical | ecological | philosophical
- `origin_tradition` — the intellectual tradition it comes from

---

#### `framework`
An overarching analytical or normative structure that organizes multiple concepts into a coherent whole.

**PLE Frameworks:**
- `L/0 Thesis` — Labor Zero: the foundational claim that obligatory labor is ending
- `Pyramid of Prosperity` — Five-layer income distribution architecture
- `Pyramid of Power` — Five-layer democratic infrastructure architecture
- `GATO Framework` — Global Automated Trade Organization governance model
- `PRIME Framework` — Policy evaluation rubric (Practicality, Rights, Implementation, Monitoring, Equity)
- `Latent Value Network` — Framework for surfacing unmeasured human value contributions

**Key attributes:**
- `scope` — descriptive | normative | analytical | evaluative
- `completeness` — outline | draft | complete | validated

---

#### `model`
A specific model within a framework — a layer of a pyramid, a dimension of PRIME, a node in LVN.

**Examples:**
- Prosperity Layer 1: Universals (UBI, UHC, Universal Basic Services)
- Prosperity Layer 2: Collectively Owned Public Assets
- Power Layer 1: Immutable Civic Bedrock
- PRIME Dimension: Equity Assessment
- LVN Category: Care Value

---

#### `tension`
An explicitly documented trade-off, contradiction, or dilemma within PLE theory. Tracking tensions is epistemically important — it makes the framework honest about where it has not resolved hard problems.

**Examples:**
- UBI vs. Work Obligation (does unconditional income undermine the case for labor?)
- Automation Speed vs. Transition Capacity (can institutions adapt fast enough?)
- Data Dividends vs. Surveillance (can we compensate data contribution without creating a panopticon?)
- Ecological Value vs. LVN Network Framing (does nature participate in a "network"?)
- Collective Ownership vs. Individual Liberty (does commons governance constrain freedom?)

**Key attributes:**
- `tension_type` — empirical | normative | political | implementation
- `resolution_status` — unresolved | partially_addressed | resolved

---

#### `actor_type`
A category of agent that participates in or is affected by the post-labor transition.

**Sub-types:**
- `individual` — The person navigating post-labor life
- `household` — The unit of care and reproduction
- `cooperative` — Worker/community-owned enterprise
- `corporation` — Capital-owning firm
- `state` — National/regional government
- `international_body` — Supranational institution (WTO, IMF, EU)
- `ai_system` — Automated agent performing economic functions
- `commons` — Collectively governed resource (open source, land trust, watershed)

---

### 1.2 ARCHITECTURE Layer

#### `goal`
A strategic outcome PLE is working toward. Goals are terminal — they represent end states, not means.

**Enhanced attributes:**
- `time_horizon` — near_term (1-3yr) | medium_term (3-10yr) | long_term (10yr+) | generational
- `scope` — individual | community | national | global
- `prosperity_layer` — which Pyramid of Prosperity layer this addresses (1-5)
- `power_layer` — which Pyramid of Power layer this addresses (1-5)

---

#### `strategy`
A general approach for achieving goals. Strategies are intentional — they express choices about how to move between current and desired states.

**Enhanced attributes:**
- `strategy_type` — advocacy | research | organizing | policy | technology | cultural
- `theory_of_change` — explicit statement of causal logic

---

#### `capability`
An organizational or community capacity required to execute strategies.

**Enhanced attributes:**
- `capability_type` — knowledge | skill | relationship | technology | resource | legitimacy
- `current_maturity` — 1-5 scale (CMM-inspired)
- `required_maturity` — 1-5 scale

---

#### `principle`
A guiding value or design rule that constrains how we pursue goals and strategies.

**Enhanced attributes:**
- `principle_type` — ethical | epistemic | operational | governance | design
- `tension_ids` — principles often create tensions with each other (transparency vs. privacy)

---

### 1.3 PRAXIS Layer

#### `project`
A bounded, collaborative work initiative. Projects are how theory becomes action.

*(Existing table — now formally linked to concepts, frameworks, and goals)*

---

#### `intervention`
A specific, implementable proposal for changing the world. More specific than a project (which is internal work), an intervention is an action directed at external systems.

**Examples:**
- Implementing a municipal UBI pilot
- Passing robot tax legislation  
- Creating a timebank in a specific community
- Building a data cooperative

---

#### `outcome`
A measurable real-world change. Outcomes are the empirical anchors of PLE claims.

**Sub-types:**
- `primary_outcome` — the intended effect of an intervention
- `secondary_outcome` — a side effect (intended or not)
- `leading_indicator` — an early signal of outcome achievement
- `lagging_indicator` — confirmation of durable change

---

### 1.4 EPISTEMOLOGY Layer

#### `evidence`
An empirical source that informs or challenges PLE claims.

**Sub-types:**
- `case_study` — a specific real-world example (Alaska PFD, Finland UBI trial, Mondragon)
- `research` — academic or policy research
- `data_source` — a dataset or statistical source
- `theoretical_argument` — a logical argument without empirical support

**Key attributes:**
- `evidence_type` — see sub-types
- `quality` — anecdotal | pilot | longitudinal | meta-analysis | consensus
- `supports` — concept IDs this evidence supports
- `challenges` — concept IDs this evidence challenges

---

#### `intellectual_source`
A thinker, tradition, or body of work that the PLE framework draws on or responds to.

**Examples:**
- Kate Raworth (Doughnut Economics)
- Nancy Folbre (Care Economy)
- Elinor Ostrom (Commons)
- James Boyle (Information Enclosure)
- Guy Standing (Precariat)
- Karl Marx (Labor Theory of Value → critique)
- Friedrich Hayek (Pricing mechanism → critique)

---

## Part II — Relationship Type Taxonomy

All relationships are typed, directed, and can carry metadata.

### 2.1 Logical Relationships

| Relationship | Source → Target | Meaning |
|---|---|---|
| `enables` | A → B | A makes B possible |
| `requires` | A → B | A cannot function without B |
| `conflicts_with` | A ↔ B | A and B are in tension |
| `addresses` | A → B | A is a response to problem B |
| `instantiates` | A → B | A is a specific instance of general concept B |
| `part_of` | A → B | A is a component of B |
| `evolved_from` | A → B | A developed out of B |
| `measures` | A → B | metric A quantifies outcome B |
| `embodies` | A → B | mechanism A operationalizes principle B |
| `challenges` | A → B | A calls B into question |
| `supports` | A → B | evidence A supports claim B |
| `critiques` | A → B | A offers a critique of B |
| `synthesizes` | A → [B, C] | A unifies B and C |

### 2.2 Governance Relationships

| Relationship | Source → Target | Meaning |
|---|---|---|
| `governs` | actor A → entity B | A has governance authority over B |
| `participates_in` | actor A → process B | A takes part in B |
| `owns` | actor A → resource B | A holds ownership of B |
| `stewards` | actor A → commons B | A is responsible for B as a commons |

### 2.3 Temporal Relationships

| Relationship | Source → Target | Meaning |
|---|---|---|
| `precedes` | A → B | A must happen before B |
| `enables_transition_to` | state A → state B | A is a stepping stone toward B |
| `supersedes` | A → B | A replaces or obsoletes B |

---

## Part III — Framework Map

### 3.1 The Dual Pyramid Structure

```
PYRAMID OF PROSPERITY                    PYRAMID OF POWER
(Income Distribution)                    (Democratic Infrastructure)

Layer 5: Meaningful Work Income          Layer 5: Meta-Governance
         ↑ Residual wages,                        ↑ Rules for changing rules,
           meaning economy                          constitutional AI
                |                                       |
Layer 4: Individual Private Assets      Layer 4: Direct Democracy  
         ↑ Investment portfolios,                 ↑ Participatory budgeting,
           baby bonds, home equity                  liquid democracy, DAOs
                |                                       |
Layer 3: Collective Private Assets      Layer 3: Radical Transparency
         ↑ Cooperatives, ESOPs,                   ↑ Open procurement,
           DAOs, data cooperatives                  algorithmic auditing
                |                                       |
Layer 2: Collective Public Assets       Layer 2: Open Payment Rails
         ↑ Sovereign wealth funds,                ↑ UPI, Pix, CBDC,
           resource trusts, commons                 interoperable wallets
                |                                       |
Layer 1: Universal Basics               Layer 1: Immutable Civic Bedrock
         ↑ UBI, UHC, universal                    ↑ Blockchain identity,
           basic services                           records, property rights
```

### 3.2 Cross-Framework Dependency Graph

```
L/0 Thesis
    │
    ├──→ Pyramid of Prosperity (income architecture)
    │         ├──→ PRIME (evaluate specific proposals)
    │         └──→ LVN (surface unmeasured value flows)
    │
    └──→ Pyramid of Power (democratic infrastructure)
              ├──→ GATO (global governance model)
              └──→ PRIME (evaluate institutional proposals)

LVN ←──→ Pyramid of Prosperity Layer 2-3
         (collective ownership as LVN mechanism)
```

---

## Part IV — Ontological Commitments

These are the foundational claims the PLE information model treats as axioms (subject to revision):

1. **Labor is not value** — Labor (the obligatory performance of work for survival) is distinct from value creation. Human beings create value through many means beyond labor.

2. **Markets are measurement systems with systematic gaps** — Markets price what is scarce, tradeable, and propertizable. Much that is valuable is abundant, shared, or intimate — therefore unpriced.

3. **Power and prosperity must be co-designed** — Economic frameworks that ignore power distribution produce capture. Both pyramids are necessary.

4. **Transitions are political, not merely technical** — The obstacles to post-labor prosperity are not engineering problems; they are problems of concentrated interest and institutional inertia.

5. **Uncertainty is structural, not temporary** — The future of AI and automation is genuinely uncertain. Models must be robust to a range of trajectories, not optimized for a single prediction.

---

## Part V — Information Model Evolution Protocol

### 5.1 Adding New Entity Types
New entity types require:
- A definition with distinguishing criteria
- At least 3 concrete examples
- Mapping to at least one existing type (as subtype, complement, or contrast)
- A GitHub Discussion or Issue before merge

### 5.2 Adding New Relationship Types
New relationship types require:
- Clear directionality (A → B or A ↔ B)
- Distinguishing criteria from similar relationships
- At least 2 example instantiations

### 5.3 Versioning
The metamodel is versioned semantically:
- **Major** — entity types added or removed, relationship type semantics changed
- **Minor** — new relationship types, attribute additions
- **Patch** — documentation, examples, seed data

---

## Part VI — Implementation Notes

### 6.1 Database Tables (v2.0 additions)
```
concepts             — Core PLE concept vocabulary
frameworks           — Major analytical frameworks
framework_elements   — Layers/components within frameworks
concept_relations    — Typed relationship graph
evidence_sources     — Empirical anchors
intellectual_sources — Research lineage
tensions             — Documented trade-offs
actor_types          — Agent taxonomy
interventions        — Real-world change proposals
outcomes             — Measurable results
```

### 6.2 API Endpoints (v2.0 additions)
```
GET  /api/concepts              — Concept browser
GET  /api/concepts?id=X         — Concept detail with relationships
GET  /api/frameworks            — Framework index
GET  /api/frameworks?id=X       — Framework with elements
GET  /api/tensions              — Tension registry
GET  /api/evidence?conceptId=X  — Evidence for a concept
GET  /api/graph                 — Full relationship graph (for visualization)
```

---

*Last updated: February 2026*  
*This metamodel is a living document. Contributions via GitHub Issue or Pull Request.*

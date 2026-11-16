import { MultiDirectedGraph } from 'graphology';
import {
  NotFoundError,
  ValidationError,
  validateNovel,
  type Fact,
  type GraphData,
  type GraphEdge,
  type GraphNode,
  type Novel,
} from '@bl/shared';
import type { GraphStore } from './GraphStore';

export class InMemoryGraphStore implements GraphStore {
  private initialNovel: Novel;
  private currentNovel: Novel;
  private graph: MultiDirectedGraph;

  constructor(novel: Novel) {
    this.initialNovel = structuredClone(novel);
    this.currentNovel = structuredClone(novel);
    this.graph = new MultiDirectedGraph();
    this.buildGraph();
  }

  private buildGraph(): void {
    this.graph.clear();

    for (const entity of this.currentNovel.entities) {
      if (!this.graph.hasNode(entity.id)) {
        this.graph.addNode(entity.id, { ...entity });
      }
    }

    for (const fact of this.currentNovel.facts) {
      if (!this.graph.hasNode(fact.subject)) {
        this.graph.addNode(fact.subject);
      }
      if (!this.graph.hasNode(fact.object)) {
        this.graph.addNode(fact.object);
      }
      this.graph.addEdgeWithKey(fact.id, fact.subject, fact.object, { ...fact });
    }
  }

  getNovel(): Novel {
    return this.currentNovel;
  }

  getFact(id: string): Fact | undefined {
    return this.currentNovel.facts.find((f) => f.id === id);
  }

  factsUpTo(chapter: number): Fact[] {
    return this.currentNovel.facts.filter((f) => f.chapter <= chapter);
  }

  entityFirstChapter(entityId: string): number {
    let minChapter = Infinity;

    for (const fact of this.currentNovel.facts) {
      if (fact.subject === entityId || fact.object === entityId) {
        if (fact.chapter < minChapter) {
          minChapter = fact.chapter;
        }
      }
    }

    for (const chapter of this.currentNovel.chapters) {
      for (const line of chapter.lines) {
        if (line.speaker === entityId || line.mentions.includes(entityId)) {
          if (line.chapter < minChapter) {
            minChapter = line.chapter;
          }
        }
      }
    }

    return minChapter;
  }

  graphUpTo(chapter: number): GraphData {
    const visibleEntities = this.currentNovel.entities.filter(
      (entity) => this.entityFirstChapter(entity.id) <= chapter
    );

    const nodes: GraphNode[] = visibleEntities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      description: entity.description,
      firstChapter: this.entityFirstChapter(entity.id),
    }));

    const visibleFacts = this.factsUpTo(chapter);

    const edges: GraphEdge[] = visibleFacts.map((fact) => ({
      id: fact.id,
      source: fact.subject,
      target: fact.object,
      predicate: fact.predicate,
      chapter: fact.chapter,
      status: fact.status,
      note: fact.note,
    }));

    return {
      nodes,
      edges,
      links: edges,
    };
  }

  applyEdit(factId: string, patch: Partial<Fact>): Fact {
    const factIndex = this.currentNovel.facts.findIndex((f) => f.id === factId);
    if (factIndex === -1) {
      throw new NotFoundError(`Fact with id "${factId}" not found`);
    }

    const currentFact = this.currentNovel.facts[factIndex];
    const updatedFact: Fact = {
      ...currentFact,
      ...patch,
      id: factId, // ID cannot be overwritten by patch
    };

    // Validate candidate novel before mutating store state
    const candidateNovel = structuredClone(this.currentNovel);
    candidateNovel.facts[factIndex] = updatedFact;
    const errors = validateNovel(candidateNovel);
    if (errors.length > 0) {
      throw new ValidationError(`Candidate novel invalid: ${errors.join('; ')}`);
    }

    this.currentNovel.facts[factIndex] = updatedFact;

    // Mutate graphology edge consistently
    if (this.graph.hasEdge(factId)) {
      this.graph.dropEdge(factId);
    }
    if (!this.graph.hasNode(updatedFact.subject)) {
      this.graph.addNode(updatedFact.subject);
    }
    if (!this.graph.hasNode(updatedFact.object)) {
      this.graph.addNode(updatedFact.object);
    }
    this.graph.addEdgeWithKey(updatedFact.id, updatedFact.subject, updatedFact.object, {
      ...updatedFact,
    });

    return updatedFact;
  }

  reset(): void {
    this.currentNovel = structuredClone(this.initialNovel);
    this.buildGraph();
  }

  getGraph(): MultiDirectedGraph {
    return this.graph;
  }
}

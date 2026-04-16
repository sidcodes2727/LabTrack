# UML Diagrams - LabTrack

This folder contains PlantUML source files for project UML documentation.

## Diagram Files

1. `01-use-case.puml`
2. `02-class-diagram.puml`
3. `03-sequence-student-complaint-to-resolution.puml`
4. `04-sequence-admin-kanban-notification-flow.puml`
5. `05-activity-complaint-lifecycle.puml`
6. `06-component-diagram.puml`
7. `07-deployment-diagram.puml`
8. `08-er-diagram.puml`

## Render Options

## 1) VS Code Extension

Install PlantUML extension and open any `.puml` file.

## 2) PlantUML CLI

```bash
plantuml docs/uml/*.puml
```

## 3) Docker (no local install)

```bash
docker run --rm -v ${PWD}:/data plantuml/plantuml docs/uml/*.puml
```

# Using SysML Viewer

SysML Viewer shows a SysML v2 model as diagrams and lets you arrange those diagrams. The `.sysml` files are the model; the viewer reads them and never writes them. What you change in the viewer is the layout: where parts, ports, connections and labels sit, how they look, and how each diagram is set up.

This tutorial walks through the window from left to right, then explains how to select and move things, what happens when you save, and where to find the rest.

## Starting the viewer

Start the viewer from the repository root and open http://127.0.0.1:5174/ in a browser:

```bash
./sysmlviewer.sh start                          # UI and API on port 5174
./sysmlviewer.sh start -f /path/to/folder       # open a workspace folder
./sysmlviewer.sh start -p /path/to/project.json # open a project file
./sysmlviewer.sh stop
./sysmlviewer.sh status
```

- `-f` (`--folder`) opens a workspace folder. The project file `project.json` sits at the root of that folder.
- `-p` (`--project`) opens a `project.json`. Its parent folder becomes the workspace.
- Without `-f` or `-p` the viewer starts without a project. Open one with **New**, **Open** or **Examples…** in the header.
- `--build` rebuilds the user interface before starting, and `--dev` starts a development server with hot reload on port 5173. On Windows, use `sysmlviewer.bat` with the same subcommands.

### New and Open

- **New** opens the *New project* dialog. Enter a **Name** and a **Folder path** (or click **Browse…**), then **Create**. The viewer writes `project.json` and `state.json` into the folder. Every `.sysml` file under the folder belongs to the project.
- **Open** opens the *Open project* dialog. Click one of the **Example projects**, or choose **Open by** *Folder* or *project.json path*, enter the path (or **Browse…**) and click **Open**.

**Browse…** opens a file dialog on the computer that runs the viewer.

## The window at a glance

| Area | What it is for |
|------|----------------|
| Header (top) | Projects, tutorials, saving, printing, events and settings |
| Left sidebar | The **Model** tree and the **Files** list of the open project |
| Canvas (middle) | Diagrams, tutorials and documentation files in tabs, and the source text of a SysML file |
| Right sidebar | **Details** and **Documentation** of the selected element |

Drag the borders between the areas to resize them. The **›** button at the top of the right sidebar (*Hide details panel*) hides it; *Show details panel* brings it back. The sizes are remembered in the browser.

## The header

The header shows the project name and the end of its folder path, followed by these controls:

| Control | Tooltip | What it does |
|---------|---------|--------------|
| **Examples…** | | Opens one of the example projects, or **Open other…** for the Open dialog |
| **Tutorials…** | | Opens a tutorial, like this one, in a new canvas tab |
| **New** | | Creates a project in a folder |
| **Open** | | Opens a project by folder or `project.json` path |
| **Save** | | Saves the project and checks the open diagram against its saved file (see *What happens when you save*) |
| **Export JSON** | Export the open view layout as JSON | Saves a copy of the open diagram's layout file through a Save As dialog |
| **Delete** | | Deletes the project's `project.json` and `state.json` after a confirmation. The `.sysml` files are kept |
| **Sheet** | Drawing sheet | Sets up a title block (title, creator, editor, version, date, drawing ID, position) and a paper frame (A4 or A3, landscape or portrait, visible on the canvas or not) |
| **Print** | | Prints selected diagrams: one per page, packed to save space, or several on one page, optionally with each view's documentation |
| **Events** | | Opens the Events list at the bottom of the canvas. A number on the button counts new errors |
| **⚙** | Settings | Opens the settings |

### Settings

The settings apply to every project and are stored in the browser:

- **View mode**: Light or Dark.
- **Show diagram details**: show **Attributes**, the default number of **Hierarchical diagram levels**, the **Structure notation** (*SysML v2 aggregation notation* or *Arcadia / SysML v1 aggregation notation*), and how **Nested ports** are revealed (*Hover details* or *Subport annotations*).
- **Requirement objects**: what the two header slots and the body of a requirement box show, and which attribute the Documentation panel shows when a requirement has no markdown file.
- **Selected connection**: highlight colour and line width factor of a selected connection.
- **Connection routing**: **Connection Separation (px)**, **Show jumpers** at crossings, and **Include bindings in Redraw / AutoLayout**.
- **Icon libraries**: the SVG icon libraries and their variants (see *Icons*).

## The left sidebar

### Model

The **Model** tab shows the model as a tree: folders, then packages, then the elements inside them. Each row starts with the kind of element (`package`, `part`, `view`, …). Views show their view type, such as «SequenceView».

- Click a **view** to open its diagram in the current canvas tab.
- Click another element to open a diagram of that element. A package opens its general diagram.
- Double-click an element to open its dialog (see *Double-click dialogs*).
- Drag the **⋮⋮** grip to reorder siblings. The order is remembered in the browser.
- **Collapse** folds the whole tree. **Filter** chooses which element kinds the tree shows.
- **Locate in Model** in the Details panel expands the tree to an element and scrolls to it.

### Files

The **Files** tab lists the project's folders, `.sysml` files and markdown documentation files.

- Click a `.sysml` file to show its source text in the canvas, with any parse warnings below it. **Back to diagram** returns to the diagram.
- A number after a file name is its count of parse warnings; hover it to read them.
- **↻** (*Refresh from disk*) reads the file again.
- Right-click a `.sysml` file for **Refresh**, **View as text** and **Delete file**. Delete file removes the file from disk.
- Click a markdown (`md`) file to open it in a new canvas tab.
- **Add SysML file by relative path…** adds a `.sysml` file that already exists under the project folder.

## The canvas

### Tabs

Each diagram, tutorial and documentation file is a tab above the canvas. Click a tab to switch, and **×** to close it.

- Clicking a view in the Model tree replaces the diagram in the current tab.
- Tutorials and markdown files always open in a new tab.
- Parts that have their own diagrams show **>>** in the top-right corner. Click it for a list of those diagrams. Hold Ctrl (Cmd on macOS) while you choose one to get a menu with **Same tab**, **New tab** and **New window**.
- **Back** in the diagram toolbar goes to the previous diagram.

### Diagram types

The view type in the SysML file decides the diagram type. The diagram's name and type are shown at the top of the canvas.

| View type in SysML | Diagram type shown |
|--------------------|--------------------|
| `GeneralView`, `InterconnectionView` with a part exposed | Interconnection: the part as a frame with its inner parts, ports, connections and bindings |
| `GeneralView` with a package or other elements exposed | Structure: parts, requirements and the relations between them |
| `SequenceView` | Sequence |
| `StateTransitionView` | State |
| `ActionFlowView` | Action flow, or the swimlane activity of a use case (see below) when the view exposes one use case |
| `TreeView` | Tree |
| `AllocationView` | Allocation, or the realization chain (use case, function, function node, logical part in four columns) when the view exposes a use case, a package with use cases or a function |
| `GridView` | Requirements table, or the realization matrix when the view exposes use cases and no requirements |
| `UseCaseView` | Use case |

The requirements table has its own toolbar buttons, **Flat** and **Hierarchical**. Hierarchical nests the requirements along their «refine» relations. Double-click a row to open the requirement's dialog.

**Use case swimlanes.** An `ActionFlowView` that exposes one use case draws its activity on lanes. A switch in the toolbar picks the lanes: **Black box** (the actors and the system), **White box** (one lane per function node, framed by its function; each system step that function steps realize is replaced by them in the order of their flow) and **Logical** (one lane per logical part, by `allocate`). A step no function step realizes gets a red frame and a warning (only when the use case has step links; without them nothing is checked and no step is marked), a step a whole flow realizes a dashed frame, a step in several lanes a `+n` badge, and an included use case is a call node (double-click opens its view). Drag a lane by its header to change the order, drag its right edge to change the width; the order is saved per mode and the width per lane, with the view, and **Redraw** forgets both. A lane without steps is one the use case reaches by a `#refine` from the node itself (dotted) or only through the function that refines it (dashed). The steps themselves cannot be moved.

### What a diagram shows

Several settings decide how much a diagram shows:

- **Hierarchical levels**: how many levels of nested parts are drawn. The default is set in Settings; a single diagram can override it under **Diagram levels** at the top of the Details panel (**Override global levels**).
- **View filter**: click an empty part of the canvas so that Details shows the view itself, then click **view-filter** to filter out artefacts in that view.
- **Structure notation** and **Attributes** in Settings.
- **View mode** in Settings switches between light and dark.

Below the diagram, at the bottom left, are zoom in, zoom out, fit view and a lock that switches the canvas between interactive and view-only. At the bottom right is a minimap you can drag and zoom in.

## The diagram toolbar

The toolbar above the diagram depends on the diagram type. Buttons with only an icon show their tooltip when you hover them.

| Button | Tooltip | What it does | Shown for |
|--------|---------|--------------|-----------|
| **Back** | Go to previous diagram | Opens the previous diagram | All except the requirements table |
| Undo icon | Undo (Ctrl/Cmd+Z) | Undoes the last layout change in this diagram | All except the requirements table |
| Redo icon | Redo (Ctrl/Cmd+Y) | Redoes it | All except the requirements table |
| Lock icon | Lock every artifact and connection in this diagram | Locks all elements so they cannot be moved or edited | All diagrams |
| Open lock icon | Unlock every artifact and connection in this diagram | Unlocks all elements | All diagrams |
| **Bulk** | Run one command on the selection | Menu with **Lock**, **Unlock**, **Direct** and **Angular** for the selected elements. Direct and Angular set the routing of selected connections | All diagrams |
| Copy icon | Copy diagram image to clipboard (always light theme, white background) | Copies a picture of the diagram | All except the requirements table |
| Layout Rules icon | Layout Rules | Opens Layout Rules: scopes for the whole diagram, a package or a part, each arranged by its own rules and layers | All except the requirements table |
| AutoLayout icon | Open AutoLayout directives, then place parts/ports and route connections | Opens the AutoLayout dialog (see *Redraw and AutoLayout*) | Interconnection and Structure |
| **Redraw: Connections** | Reroute connections around parts using current port placement (does not move parts or ports) | Routes all connections again | Interconnection and Structure |
| **Redraw: Relations** | Redraw dependency, satisfy, include, allocation and other relations as straight lines between the facing borders (does not move nodes) | Draws all relations again as straight lines | Interconnection and Structure, when there are relations |
| Flip icon | Flip port placement horizontal | Mirrors the ports of the selected parts left to right | Interconnection and Structure, with a part selected |
| Flip icon | Flip port placement vertical | Mirrors the ports of the selected parts top to bottom | Interconnection and Structure, with a part selected |
| Distribute icons | Distribute selected elements horizontally / vertically (even center spacing) | Spaces three or more selected elements evenly. With two or more ports selected: *Distribute selected ports …* | Interconnection, Structure and Use case, with three or more elements (or two ports) selected |
| Jumper icon | Update jumpers | Recomputes the small arcs where connections cross | Interconnection and Structure, when **Show jumpers** is on |
| Align icons | Align selected to first selected (horizontal = same Y / vertical = same X) | Aligns the selection to the element you selected first. With one direct connection selected: *Align target port to source port X / Y* | Interconnection, Structure and Use case, with two or more elements selected |
| **Redraw: TD** | Redraw top-down | Lays out the diagram again from top to bottom | Sequence, State, Action flow, Tree and Use case |
| **Redraw: LR** | Redraw left-right | Lays it out again from left to right | Sequence, State, Action flow, Tree and Use case |
| **Redraw: Relations** | Recompute facing anchors for include, extend, and actor associations (does not move nodes) | Draws the use case relations again | Use case |
| **Flat** / **Hierarchical** | | Switches the requirements table between a flat list and a tree | Requirements table |

## The right sidebar

### Details

**Details** shows the selected element. With nothing selected it shows the diagram's **Diagram levels**. For an element it shows:

- **Name**, **Kind** and **Id** (the qualified name), and for interfaces and typed ports a **Locate in Model** button.
- **Edit**: a lock. A locked element cannot be moved or edited in this diagram. Click it to unlock.
- **Position** and **Size** of a part, which you can type in.
- **Routing** of a connection or relation: *angular*, *direct* or *spline*. **Autoroute** (*Clear waypoints and redraw the orthogonal route*) routes an angular connection again. **Connection points** lists its waypoints; a locked point stays put on **Redraw: Connections**.
- **Format**: colours of background, header, body, line and text and the line thickness, separately for the light and the dark view mode. **Paint** (*Copy format — click another element to paint*) copies the format to the next element you click; press Escape to stop. If several elements are selected, Paint applies the format to all of them at once.
- **Ports**, **Attributes** and **Sub-parts** of a part.
- **Relations**: every relation to and from the element, with its stereotype. Click an element to open its dialog.
- The **dependency tree** button, the tree icon next to the **Details** heading (see *The dependency tree*).

### Documentation

**Documentation** shows the markdown file of the selected element. The file lives in a `docs/` folder next to the element's SysML file and is named after the package chain, for example `logical_architecture/docs/LogicalArchitecture.frictionBrakes.md`. The path is shown above the text. Links to other markdown files open in a dialog. If there is no file the panel says *Documentation not found* and names the paths it looked for.

## Selecting several objects

- **Shift+click** adds an element to the selection, or removes it if it is already selected. This works for parts, connections and relations.
- **Shift+drag** on an empty part of the canvas draws a rectangle and selects everything inside it.
- **Ctrl+A** (Cmd+A on macOS) selects every element in the diagram.
- **Option+Shift** (Alt+Shift) selects **ports**: click ports, or drag a rectangle around them.
- Click an empty part of the canvas to clear the selection. Details then shows the diagram's own view element.

The element you selected first is the anchor: the align buttons line the others up with it. Details shows the element you clicked last. With several parts selected, Details shows how many there are and lets you set one **Size** and one **Format** for all of them.

## Moving things

Every move is saved straight away (see *What happens when you save*), and **Undo** takes it back.

### Parts and other boxes

- Drag a part, requirement, use case or actor to move it. Moving a part moves what is inside it.
- Select a part and drag its corner handles to resize it, or type **Position** and **Size** in Details.
- Arrow keys move the selected elements.

### Ports and their names

Hold **Option** (macOS) or **Alt**. A banner at the top of the canvas confirms the mode. While the key is held you can:

- drag a port along the border of its part;
- drag a port name to move the label; the name keeps following the port;
- add **Shift** to select several ports, then use the distribute buttons in the toolbar.

To mirror all ports of a part, select the part and use **Flip port placement horizontal** or **vertical**.

### Connections, bindings and their waypoints

A connection or binding has a routing: *angular* (right-angled), *direct* (a straight line) or *spline* (a curve). Change it in Details, or for several at once with **Bulk** › **Direct** or **Angular**.

Hold **Option** or **Alt** to edit an angular connection:

- the corner points (waypoints) appear as dots; drag one to move it (*Drag to move connection point*);
- every straight segment gets a handle in its middle; drag it to move the whole segment sideways (*Drag left/right* or *Drag up/down*).

To start over, select the connection and click **Autoroute** in Details, or route all connections with **Redraw: Connections**. Lock single waypoints under **Connection points** in Details to keep them where they are. The setting **Include bindings in Redraw / AutoLayout** decides whether bindings are rerouted too.

### Relations

Dependencies, satisfy, allocations, include and the other relations are drawn as lines between the borders of the elements they join. Hold **Option** or **Alt** and drag either end of a relation along the border of its element (*Option-drag along part boundary*). **Redraw: Relations** draws all relations again as straight lines between the facing borders. In a use case diagram, select a relation and click **Redraw** in Details to redraw only that one.

### Labels

Hold **Option** or **Alt** and drag the name of a connection or relation to move it (*Drag to move connection name*). A thin leader line then joins the name to its line. On a direct or spline line, a handle in the middle of the line moves the name as well.

### Locking

Lock an element (the **Edit** lock in Details), a selection (**Bulk** › **Lock**) or the whole diagram (the lock button in the toolbar) when it is where you want it. Locked elements cannot be dragged, and a locked connection ignores drags on its waypoints, segments, name and ends.

## Connection handles

Connection handles are the small dots where lines attach to a shape. They are shown only while you hold down **Option** (macOS) or **Alt**. Release the key and they are hidden again, so they do not get in the way when you select and move elements. This applies to action flows (actions, decisions, start and done), the use case dialog, state diagrams, and use case, actor and requirement nodes. Lines always end on the outline of the shape, whether the handles are shown or not; on a decision diamond they meet the tips.

Ports in structure diagrams are not connection handles. They are elements of the model, so they are always visible; holding Option or Alt switches them to port-move mode (see *Ports and their names*).

## Redraw and AutoLayout

- **Redraw: Connections** and **Redraw: Relations** route lines again without moving any part.
- **Redraw: TD** and **Redraw: LR** lay out sequence, state, action flow, tree and use case diagrams again, top-down or left-right.
- **AutoLayout** places the parts and ports of an interconnection or structure diagram and then routes the connections. The dialog has a **Simple** and an **Advanced** mode:
  - **Place by**: which edges keep elements close together: **Connections**, **Bindings** and **Relations**. Choose Relations for requirement and traceability diagrams.
  - **Port placement**: *Inputs left, outputs right* (ports ending in `In` on the left, `Out` on the right) or one of the *Optimized placement* modes.
  - **Part placement**: *Favour grid*, *Force grid (shrink to fit)*, *Clustered*, *Stress* or *Layered (left → right)*, with spacing and aspect ratio.
  - Click **Run AutoLayout**. The **Place by** choice is saved with the view.
- **Layout Rules** lets you give the whole diagram, a package or a part its own layers and rules, and **Apply** them.

AutoLayout moves elements, so lock the ones you want to keep in place first. **Undo** takes a layout back.

## Double-click dialogs

Double-clicking an element in a diagram, in the Model tree or in the requirements table opens a dialog:

- **Parts, interfaces, packages, views, requirements, connections and bindings** open a dialog with Details on the left and Documentation on the right. **🗖** maximises the dialog and **×** closes it.
- **Use cases** open the use case dialog. On the left are the use case's **Parameters** (Title, Actor, Subject and Objective), its **Requirements** with their relation («objective» or «refine»), and its **Actions**. On the right is the use case's activity flow, from start through its actions and alternative paths to the end. Click a requirement to open it, or an action to open it as a diagram in a new tab. The header has the dependency tree button.

Clicking an element listed under **Relations** in Details opens the same dialogs.

## The dependency tree

The dependency tree shows how an element is traced. Open it with the tree icon next to the **Details** heading, or in the header of the use case dialog.

- **Up**: one chain from the most abstract element, usually a requirement, down to the selected element. Each step names the relation to the element below it, for example «refine», «objective», «allocate» or «implements». **+N** means there were N more candidates at that level that the chain does not follow.
- **Down**: everything that depends on the element, as a tree you can fold. **↺** marks an element shown elsewhere in the tree; **…** marks a branch cut off at the size or depth limit.

Click an element in the tree to open its dialog. The tutorial *MBSE introduction* explains how to model so that the chain reaches all the way from a physical part to a requirement.

## What happens when you save

Each file in a project has one job:

| File | Role |
|------|------|
| `*.sysml` | The model and the source of truth. The viewer reads these files and never writes them. Edit them in a text editor |
| `state.json` | A cache of the parsed model, the list of views, the drawing sheet and the global visualisation, such as the format of each element. It holds no diagram geometry |
| `views/<view>.json` | One file per diagram with its geometry (positions and sizes, port sides and offsets, label offsets, connection waypoints and routing, locks) and its own settings (diagram levels override, view filter, Layout Rules and the AutoLayout **Place by** choice) |
| `project.json` | The project's id, name and dates |

- **Auto-save**: dragging a part, a port, a waypoint or a label, resizing and locking write the change at once to that diagram's file in `views/`; so do the diagram's own settings. A **Format** change is saved at once in `state.json` and applies wherever the element is drawn. You do not have to press Save to keep a layout.
- **Save** first waits for any of these writes that are still on their way. It then saves the project to `state.json`, writes the open diagram to its view file, and reads the file back to check that it matches what is on screen. The result shows up in **Events**; if something differs, the Events list opens with the elements and fields that differ.
- **Export JSON** saves a copy of the open diagram's view file wherever you choose. It does not change the project.
- **Events** lists what saving and loading did, with **info**, **warning** and **error** rows. **Compare now** compares the diagram on screen with its saved view file.

### When a file changes outside the viewer

There is no live file watching. The viewer reads the `.sysml` files again from disk whenever a project is opened and whenever a diagram is opened, so a diagram you open after editing a SysML file shows the change. Layout is kept for every element whose qualified name is unchanged; removed elements disappear and new ones get a default place. To update the Model tree and Files list, click **↻** next to the file (or **Refresh** in its right-click menu), or reload the browser page. A view file in `views/` is also read again when its diagram is opened.

### A word of caution

- **Delete file** in the Files tab removes the `.sysml` file from disk.
- **Backspace** removes the selected element from the canvas until the diagram is opened again. It does not change the model or the saved layout.

## Icons

A part can show an icon. Give it an attribute in the SysML file:

- `_icon` puts an icon in the part's header.
- `_icon_body` puts a larger icon in the body of a closed part. When the part is drawn open with its inner parts, the icon moves to the header.

A bare name such as `"battery"` is the name of a Lucide icon. A name with a library prefix, such as `"iconmind/battery"`, comes from one of the SVG libraries listed under **Icon libraries** in Settings; icons the project does not have yet are copied into `icons/<library>/` in the project. From the `electric_car` example:

```sysml
part battery {
  attribute _icon="battery";
  // …
}
part batteryPack {
  attribute _icon_body = "iconmind/battery";
  // …
}
```

## Tutorials and documentation

- **Tutorials…** in the header lists the built-in tutorials. Each opens in its own canvas tab.
- The **Documentation** panel shows the markdown file of the selected element (see *The right sidebar*).
- The **Files** tab lists every markdown file of the project; click one to open it in a tab.

## Keyboard and mouse

| Keys | Where | What it does |
|------|-------|--------------|
| Ctrl/Cmd+Z | Diagram | Undo |
| Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z | Diagram | Redo |
| Ctrl/Cmd+A | Diagram | Select every element |
| Shift+click | Diagram | Add to or remove from the selection |
| Shift+drag | Diagram | Select with a rectangle |
| Arrow keys | Diagram | Move the selected elements |
| Option/Alt (hold) | Interconnection and structure diagrams | Move ports, port names, waypoints, segments, relation ends and labels |
| Option+Shift / Alt+Shift (hold) | Interconnection and structure diagrams | Select ports by clicking or with a rectangle |
| Double-click | Diagram, Model tree, requirements table | Open the element's dialog |
| Ctrl/Cmd+click | **>>** list of a part | Choose same tab, new tab or new window |
| Escape | Element, markdown and dependency tree dialogs; Paint | Close the dialog; stop painting a format |
| Mouse wheel, pinch | Diagram | Zoom |
| Drag on empty canvas | Diagram | Pan |

## The examples

**Examples…** in the header opens the example projects that ship with the viewer:

- **Electric Car** (`examples/electric_car`) is a complete MBSE model of a small battery-electric car: requirements and user stories, use cases, functions with their flows, the logical architecture, sequences and a state machine, and the physical architecture, with a markdown documentation file for each element. It is the running example of the tutorial *MBSE introduction*.
- **Diagrams** (`examples/diagrams`) has one small model per diagram type: action flow, interconnection, sequence (`interaction def`), sequence as SysML v2 `occurrence def` (`occurrence_sequences.sysml`, every way to declare a lifeline), hierarchical parts and nested ports, part relationships, state machine, requirements graph and table, trees and use cases.

The examples open from the `examples/` folder of the viewer's installation, so layout changes are saved into those files. Copy an example folder and open the copy if you want to experiment without changing the original.

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";

/* ───────────────────────── helpers ───────────────────────── */
let _idCounter = 0;
const uid = () => "id_" + (++_idCounter) + "_" + Math.random().toString(36).slice(2, 8);

/* ───────────────────────── design tokens ───────────────────────── */
const TOKENS = {
  bg: "#F4F1EA",
  accent: "#C84315",
  secondary: "#1a1a1a",
  trackPalette: ["#C84315", "#2a6496", "#4a7c3f", "#7b5ea7", "#b5631a", "#3a7a7a"],
  nodeRadius: 20,
  trackHeight: 100,
  topPadding: 80,
  leftPadding: 160,
  rightPadding: 60,
  yearWidth: 120,
  transition: "60ms linear",
};

const FONTS_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Space+Mono:wght@400;700&family=Barlow+Condensed:wght@500&display=swap');

:root {
  --bg: ${TOKENS.bg};
  --accent: ${TOKENS.accent};
  --secondary: ${TOKENS.secondary};
}
`;

/* ───────────────────────── example data ───────────────────────── */
function buildExampleData() {
  const tracks = [
    { id: uid(), person: "Barack Obama", color: "#C84315", startYear: 2009, endYear: 2017 },
    { id: uid(), person: "Hillary Clinton", color: "#2a6496", startYear: 2009, endYear: 2017 },
    { id: uid(), person: "John Kerry", color: "#4a7c3f", startYear: 2009, endYear: 2017 },
    { id: uid(), person: "Eric Holder", color: "#7b5ea7", startYear: 2009, endYear: 2017 },
    { id: uid(), person: "Tim Geithner", color: "#b5631a", startYear: 2009, endYear: 2017 },
    { id: uid(), person: "Joe Biden", color: "#3a7a7a", startYear: 2009, endYear: 2017 },
  ];

  const n = (person, year, label) => ({ id: uid(), person, year, label });
  const nodes = [
    n("Barack Obama", 2009, "Inaugurated"),
    n("Barack Obama", 2013, "2nd Term"),
    n("Barack Obama", 2017, "End of Presidency"),
    n("Hillary Clinton", 2009, "SecState Start"),
    n("Hillary Clinton", 2013, "SecState End"),
    n("John Kerry", 2013, "SecState Start"),
    n("John Kerry", 2017, "SecState End"),
    n("Eric Holder", 2009, "AG Start"),
    n("Eric Holder", 2015, "AG End"),
    n("Tim Geithner", 2009, "Treasury Start"),
    n("Tim Geithner", 2013, "Treasury End"),
    n("Joe Biden", 2009, "VP Start"),
    n("Joe Biden", 2013, "VP 2nd Term"),
    n("Joe Biden", 2017, "VP End"),
  ];

  const findNode = (person, year) => nodes.find((nd) => nd.person === person && nd.year === year);

  const connections = [
    { id: uid(), fromNodeId: findNode("Barack Obama", 2009).id, toNodeId: findNode("Hillary Clinton", 2009).id, label: "Secretary of State" },
    { id: uid(), fromNodeId: findNode("Hillary Clinton", 2013).id, toNodeId: findNode("John Kerry", 2013).id, label: "SecState Transition" },
    { id: uid(), fromNodeId: findNode("Barack Obama", 2009).id, toNodeId: findNode("Eric Holder", 2009).id, label: "Attorney General" },
    { id: uid(), fromNodeId: findNode("Barack Obama", 2009).id, toNodeId: findNode("Tim Geithner", 2009).id, label: "Treasury Secretary" },
    { id: uid(), fromNodeId: findNode("Barack Obama", 2009).id, toNodeId: findNode("Joe Biden", 2009).id, label: "Vice President" },
    { id: uid(), fromNodeId: findNode("Barack Obama", 2013).id, toNodeId: findNode("Joe Biden", 2013).id, label: "Vice President 2nd Term" },
  ];

  return { tracks, nodes, connections, branches: [], startYear: 2009, endYear: 2017 };
}

/* ───────────────────────── main component ───────────────────────── */
export default function TimelineConnections() {
  const example = useMemo(() => buildExampleData(), []);

  const [tracks, setTracks] = useState(example.tracks);
  const [nodes, setNodes] = useState(example.nodes);
  const [connections, setConnections] = useState(example.connections);
  const [branches, setBranches] = useState(example.branches);
  const [startYear, setStartYear] = useState(example.startYear);
  const [endYear, setEndYear] = useState(example.endYear);

  /* interaction state machine */
  const [interactionState, setInteractionState] = useState("IDLE");
  const [dragSourceNodeId, setDragSourceNodeId] = useState(null);
  const [dragStartPos, setDragStartPos] = useState(null);
  const [cursorPos, setCursorPos] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // {type, id, x, y}
  const [newPersonInput, setNewPersonInput] = useState(null); // {x, y, value}
  const [editingBranchId, setEditingBranchId] = useState(null);
  const [editingBranchValue, setEditingBranchValue] = useState("");

  /* drag-node state */
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [nodeDragStart, setNodeDragStart] = useState(null);

  const svgRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastClickTimeRef = useRef(0);

  /* ─── coordinate helpers ─── */
  const canvasWidth = useMemo(() => {
    const yearSpan = endYear - startYear;
    return TOKENS.leftPadding + yearSpan * TOKENS.yearWidth + TOKENS.rightPadding;
  }, [startYear, endYear]);

  const canvasHeight = useMemo(() => {
    return TOKENS.topPadding + tracks.length * TOKENS.trackHeight + 60;
  }, [tracks.length]);

  const yearToX = useCallback(
    (year) => TOKENS.leftPadding + ((year - startYear) / (endYear - startYear)) * ((endYear - startYear) * TOKENS.yearWidth),
    [startYear, endYear]
  );

  const xToYear = useCallback(
    (x) => {
      const raw = startYear + ((x - TOKENS.leftPadding) / ((endYear - startYear) * TOKENS.yearWidth)) * (endYear - startYear);
      return Math.round(raw * 10) / 10;
    },
    [startYear, endYear]
  );

  const trackY = useCallback((trackIndex) => TOKENS.topPadding + trackIndex * TOKENS.trackHeight + TOKENS.trackHeight / 2, []);

  const getTrackIndex = useCallback((person) => tracks.findIndex((t) => t.person === person), [tracks]);

  const yToTrackIndex = useCallback(
    (y) => {
      const idx = Math.round((y - TOKENS.topPadding - TOKENS.trackHeight / 2) / TOKENS.trackHeight);
      return Math.max(0, Math.min(tracks.length - 1, idx));
    },
    [tracks.length]
  );

  const getSvgPoint = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const scaleX = vb.width / rect.width;
    const scaleY = vb.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const getNodePos = useCallback(
    (nodeId) => {
      const nd = nodes.find((n) => n.id === nodeId);
      if (!nd) return null;
      const ti = getTrackIndex(nd.person);
      if (ti < 0) return null;
      return { x: yearToX(nd.year), y: trackY(ti) };
    },
    [nodes, getTrackIndex, yearToX, trackY]
  );

  /* ─── connection path builder (orthogonal routing) ─── */
  const buildConnectionPath = useCallback(
    (fromPos, toPos) => {
      if (!fromPos || !toPos) return "";
      const midX = (fromPos.x + toPos.x) / 2;
      return `M ${fromPos.x} ${fromPos.y} H ${midX} V ${toPos.y} H ${toPos.x}`;
    },
    []
  );

  /* ─── event handlers ─── */
  const handleSvgMouseDown = useCallback(
    (e) => {
      if (e.button === 2) return; // right-click handled separately
      setContextMenu(null);
      const pt = getSvgPoint(e);

      // Check if click is on a node — handled by node's own onMouseDown
      // This handles clicks on empty track / empty canvas
    },
    [getSvgPoint]
  );

  const handleNodeMouseDown = useCallback(
    (e, nodeId) => {
      if (e.button === 2) return;
      e.stopPropagation();
      setContextMenu(null);
      const pt = getSvgPoint(e);
      // Determine if click is on the edge (outer 40%) or center of the node
      const pos = getNodePos(nodeId);
      const edgeThreshold = pos ? TOKENS.nodeRadius * 0.6 : 0;
      const dist = pos ? Math.sqrt((pt.x - pos.x) ** 2 + (pt.y - pos.y) ** 2) : 0;
      const isEdgeClick = dist > edgeThreshold;
      setDragSourceNodeId(nodeId);
      setDragStartPos(pt);
      setCursorPos(pt);
      setInteractionState("DRAG_START");
      setNodeDragStart({ ...pt, nodeId, isEdgeClick });
    },
    [getSvgPoint, getNodePos]
  );

  const handleSvgMouseMove = useCallback(
    (e) => {
      const pt = getSvgPoint(e);
      setCursorPos(pt);

      if (interactionState === "DRAG_START" && dragStartPos) {
        const dx = pt.x - dragStartPos.x;
        const dy = pt.y - dragStartPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
          // Edge click = draw connection, center click = drag node
          if (nodeDragStart?.isEdgeClick) {
            setInteractionState("DRAWING_CONNECTION");
          } else {
            setInteractionState("DRAGGING_NODE");
            setDraggingNodeId(dragSourceNodeId);
          }
        }
      }

      if (interactionState === "DRAGGING_NODE" && draggingNodeId) {
        setNodes((prev) =>
          prev.map((nd) => {
            if (nd.id !== draggingNodeId) return nd;
            const newYear = Math.round(xToYear(pt.x) * 10) / 10;
            const clampedYear = Math.max(startYear, Math.min(endYear, newYear));
            const ti = yToTrackIndex(pt.y);
            const newPerson = tracks[ti]?.person || nd.person;
            return { ...nd, year: clampedYear, person: newPerson };
          })
        );
      }
    },
    [interactionState, dragStartPos, getSvgPoint, dragSourceNodeId, draggingNodeId, nodeDragStart, xToYear, yToTrackIndex, tracks, startYear, endYear]
  );

  const handleSvgMouseUp = useCallback(
    (e) => {
      const pt = getSvgPoint(e);

      if (interactionState === "DRAWING_CONNECTION") {
        // Check if we released on a node
        const targetNode = nodes.find((nd) => {
          const pos = getNodePos(nd.id);
          if (!pos) return false;
          const dx = pt.x - pos.x;
          const dy = pt.y - pos.y;
          return Math.sqrt(dx * dx + dy * dy) < TOKENS.nodeRadius + 5;
        });

        if (targetNode && targetNode.id !== dragSourceNodeId) {
          const fromNode = nodes.find((n) => n.id === dragSourceNodeId);
          const label = fromNode ? `yr ${fromNode.year} \u2013 ${targetNode.year}` : "connection";
          setConnections((prev) => [
            ...prev,
            { id: uid(), fromNodeId: dragSourceNodeId, toNodeId: targetNode.id, label },
          ]);
        }
        // else cancel
        setInteractionState("IDLE");
        setDragSourceNodeId(null);
        setDragStartPos(null);
        setDraggingNodeId(null);
        setNodeDragStart(null);
        return;
      }

      if (interactionState === "DRAG_START") {
        // Mouse didn't move >5px — treat as click, select node
        setSelectedNodeId(dragSourceNodeId);
        setInteractionState("IDLE");
        setDragSourceNodeId(null);
        setDragStartPos(null);
        setNodeDragStart(null);
        return;
      }

      if (interactionState === "DRAGGING_NODE") {
        setInteractionState("IDLE");
        setDragSourceNodeId(null);
        setDragStartPos(null);
        setDraggingNodeId(null);
        setNodeDragStart(null);
        return;
      }

      // IDLE — click on empty space (guard against double-click creating 2 nodes)
      const now = Date.now();
      if (interactionState === "IDLE" && e.button === 0 && now - lastClickTimeRef.current > 250) {
        lastClickTimeRef.current = now;
        setSelectedNodeId(null);
        // Check if click is on a track lane
        const clickedTrackIdx = yToTrackIndex(pt.y);
        const yDist = Math.abs(pt.y - trackY(clickedTrackIdx));
        if (yDist < TOKENS.trackHeight / 2 && pt.x > TOKENS.leftPadding - 10 && clickedTrackIdx < tracks.length) {
          // Create node on that track
          const year = Math.round(xToYear(pt.x) * 10) / 10;
          const clampedYear = Math.max(startYear, Math.min(endYear, year));
          const track = tracks[clickedTrackIdx];
          if (track) {
            setNodes((prev) => [...prev, { id: uid(), person: track.person, year: clampedYear, label: `Event ${clampedYear}` }]);
          }
        } else if (pt.x > TOKENS.leftPadding - 10) {
          // Click on empty canvas off all tracks — show new person input
          setNewPersonInput({ x: e.clientX, y: e.clientY, value: "" });
        }
      }
    },
    [interactionState, getSvgPoint, nodes, getNodePos, dragSourceNodeId, yToTrackIndex, trackY, tracks, xToYear, startYear, endYear]
  );

  const handleNodeDoubleClick = useCallback(
    (e, nodeId) => {
      e.stopPropagation();
      e.preventDefault();
      const pos = getNodePos(nodeId);
      if (!pos) return;
      const branchId = uid();
      setBranches((prev) => [...prev, { id: branchId, fromNodeId: nodeId, label: "branch TBD" }]);
    },
    [getNodePos]
  );

  const handleNodeContextMenu = useCallback(
    (e, nodeId) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ type: "node", id: nodeId, x: e.clientX, y: e.clientY });
    },
    []
  );

  const handleConnectionContextMenu = useCallback(
    (e, connId) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ type: "connection", id: connId, x: e.clientX, y: e.clientY });
    },
    []
  );

  const handleDeleteNode = useCallback(
    (nodeId) => {
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setConnections((prev) => prev.filter((c) => c.fromNodeId !== nodeId && c.toNodeId !== nodeId));
      setBranches((prev) => prev.filter((b) => b.fromNodeId !== nodeId));
      setContextMenu(null);
      setSelectedNodeId(null);
    },
    []
  );

  const handleDeleteConnection = useCallback(
    (connId) => {
      setConnections((prev) => prev.filter((c) => c.id !== connId));
      setContextMenu(null);
    },
    []
  );

  const handleCanvasContextMenu = useCallback((e) => {
    e.preventDefault();
  }, []);

  /* keyboard: Escape cancels drawing */
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        if (interactionState === "DRAWING_CONNECTION" || interactionState === "DRAG_START" || interactionState === "DRAGGING_NODE") {
          setInteractionState("IDLE");
          setDragSourceNodeId(null);
          setDragStartPos(null);
          setDraggingNodeId(null);
          setNodeDragStart(null);
        }
        setContextMenu(null);
        setNewPersonInput(null);
        setEditingBranchId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [interactionState]);

  /* ─── toolbar actions ─── */
  const [addPersonInput, setAddPersonInput] = useState(null); // {value}

  const handleAddPerson = useCallback(() => {
    setAddPersonInput({ value: "" });
  }, []);

  const handleAddPersonSubmit = useCallback((name) => {
    if (!name || !name.trim()) {
      setAddPersonInput(null);
      return;
    }
    const colorIdx = tracks.length % TOKENS.trackPalette.length;
    setTracks((prev) => [
      ...prev,
      { id: uid(), person: name.trim(), color: TOKENS.trackPalette[colorIdx], startYear, endYear },
    ]);
    setAddPersonInput(null);
  }, [tracks.length, startYear, endYear]);

  const handleExportJSON = useCallback(() => {
    const data = { tracks, nodes, connections, branches, startYear, endYear };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "connections.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [tracks, nodes, connections, branches, startYear, endYear]);

  const handleImportJSON = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.tracks) setTracks(data.tracks);
        if (data.nodes) setNodes(data.nodes);
        if (data.connections) setConnections(data.connections);
        if (data.branches) setBranches(data.branches || []);
        if (data.startYear != null) setStartYear(data.startYear);
        if (data.endYear != null) setEndYear(data.endYear);
      } catch {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const handleClearAll = useCallback(() => {
    if (window.confirm("Clear all data? This cannot be undone.")) {
      setTracks([]);
      setNodes([]);
      setConnections([]);
      setBranches([]);
      setStartYear(0);
      setEndYear(10);
      setSelectedNodeId(null);
      setContextMenu(null);
      animatedConnsRef.current.clear();
    }
  }, []);

  /* ─── new person inline input handler ─── */
  const handleNewPersonSubmit = useCallback(
    (name) => {
      if (!name || !name.trim()) {
        setNewPersonInput(null);
        return;
      }
      const colorIdx = tracks.length % TOKENS.trackPalette.length;
      const newTrack = { id: uid(), person: name.trim(), color: TOKENS.trackPalette[colorIdx], startYear, endYear };
      setTracks((prev) => [...prev, newTrack]);

      // Also create a node at approximately where they clicked
      const pt = getSvgPoint({ clientX: newPersonInput.x, clientY: newPersonInput.y });
      const year = Math.round(xToYear(pt.x) * 10) / 10;
      const clampedYear = Math.max(startYear, Math.min(endYear, year));
      setNodes((prev) => [...prev, { id: uid(), person: name.trim(), year: clampedYear, label: `${name.trim()} ${clampedYear}` }]);
      setNewPersonInput(null);
    },
    [tracks.length, startYear, endYear, getSvgPoint, newPersonInput, xToYear]
  );

  /* ─── branch double-click editing ─── */
  const handleBranchDoubleClick = useCallback((e, branchId) => {
    e.stopPropagation();
    e.preventDefault();
    const br = branches.find((b) => b.id === branchId);
    if (br) {
      setEditingBranchId(branchId);
      setEditingBranchValue(br.label);
    }
  }, [branches]);

  const handleBranchEditSubmit = useCallback(() => {
    if (editingBranchId) {
      setBranches((prev) =>
        prev.map((b) => (b.id === editingBranchId ? { ...b, label: editingBranchValue || "branch TBD" } : b))
      );
    }
    setEditingBranchId(null);
    setEditingBranchValue("");
  }, [editingBranchId, editingBranchValue]);

  /* ─── year ticks ─── */
  const yearTicks = useMemo(() => {
    const ticks = [];
    for (let y = startYear; y <= endYear; y += 0.5) {
      ticks.push(y);
    }
    return ticks;
  }, [startYear, endYear]);

  /* ─── track which connections have already animated ─── */
  const animatedConnsRef = useRef(new Set());

  /* ─── render ─── */
  const toolbarStyle = {
    background: TOKENS.secondary,
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "8px 16px",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 500,
    fontSize: "13px",
    color: "#fff",
    flexWrap: "wrap",
  };

  const btnStyle = {
    background: "transparent",
    border: "1px solid #555",
    color: "#fff",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontWeight: 500,
    fontSize: "13px",
    padding: "4px 12px",
    cursor: "pointer",
    borderRadius: 0,
    transition: TOKENS.transition,
  };

  const inputStyle = {
    background: "#333",
    border: "1px solid #555",
    color: "#fff",
    fontFamily: "'Space Mono', monospace",
    fontSize: "12px",
    padding: "3px 6px",
    width: "60px",
    borderRadius: 0,
  };

  const axisY = TOKENS.topPadding + tracks.length * TOKENS.trackHeight + 20;

  return (
    <div style={{ width: "100%", height: "100vh", background: TOKENS.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{FONTS_CSS}{`
        .tc-conn-path {
          animation: tc-draw 0.3s linear forwards;
        }
        @keyframes tc-draw {
          from { stroke-dashoffset: 2000; }
          to { stroke-dashoffset: 0; }
        }
        .tc-btn:hover {
          background: rgba(255,255,255,0.1) !important;
        }
      `}</style>

      {/* ─── TOOLBAR ─── */}
      <div style={toolbarStyle}>
        <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: "16px", color: TOKENS.accent, marginRight: 8 }}>
          Timeline Map
        </span>
        <span style={{ width: 1, height: 20, background: "#555", display: "inline-block" }} />
        <button className="tc-btn" style={btnStyle} onClick={handleAddPerson}>+ Person</button>
        <span style={{ marginLeft: 8 }}>Timeline:</span>
        <input
          type="number"
          style={inputStyle}
          value={startYear}
          onChange={(e) => { const v = Number(e.target.value); if (v < endYear) setStartYear(v); }}
        />
        <span>\u2013</span>
        <input
          type="number"
          style={inputStyle}
          value={endYear}
          onChange={(e) => { const v = Number(e.target.value); if (v > startYear) setEndYear(v); }}
        />
        <button className="tc-btn" style={btnStyle} onClick={handleExportJSON}>Export JSON</button>
        <button className="tc-btn" style={btnStyle} onClick={handleImportJSON}>Import JSON</button>
        <input ref={fileInputRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleFileChange} />
        <button className="tc-btn" style={btnStyle} onClick={handleClearAll}>Clear All</button>
        <span style={{ marginLeft: "auto", opacity: 0.5, fontSize: "11px" }}>
          Drag from node edge to connect \u00b7 Drag center to move \u00b7 Dbl-click to branch \u00b7 Right-click to delete
        </span>
      </div>

      {/* ─── ADD PERSON INLINE INPUT ─── */}
      {addPersonInput && (
        <div style={{ background: TOKENS.secondary, padding: "4px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 500, fontSize: 13, color: "#fff" }}>Name:</span>
          <input
            type="text"
            placeholder="Person name..."
            value={addPersonInput.value}
            autoFocus
            onChange={(e) => setAddPersonInput({ value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddPersonSubmit(addPersonInput.value);
              if (e.key === "Escape") setAddPersonInput(null);
            }}
            onBlur={() => handleAddPersonSubmit(addPersonInput.value)}
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: "13px",
              padding: "3px 8px",
              border: `1px solid ${TOKENS.accent}`,
              background: "#333",
              color: "#fff",
              borderRadius: 0,
              outline: "none",
              minWidth: "200px",
            }}
          />
        </div>
      )}

      {/* ─── CANVAS ─── */}
      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          width={canvasWidth}
          height={canvasHeight}
          style={{ display: "block", cursor: interactionState === "DRAWING_CONNECTION" ? "crosshair" : interactionState === "DRAGGING_NODE" ? "grabbing" : "default" }}
          onMouseDown={handleSvgMouseDown}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onContextMenu={handleCanvasContextMenu}
        >
          {/* background */}
          <rect x="0" y="0" width={canvasWidth} height={canvasHeight} fill={TOKENS.bg} />

          {/* track lanes */}
          {tracks.map((track, i) => {
            const y = trackY(i);
            return (
              <g key={track.id}>
                {/* track background stripe */}
                <rect
                  x={TOKENS.leftPadding}
                  y={y - TOKENS.trackHeight / 2}
                  width={canvasWidth - TOKENS.leftPadding - TOKENS.rightPadding}
                  height={TOKENS.trackHeight}
                  fill={i % 2 === 0 ? "rgba(0,0,0,0.02)" : "transparent"}
                />
                {/* track line */}
                <line
                  x1={TOKENS.leftPadding}
                  y1={y}
                  x2={canvasWidth - TOKENS.rightPadding}
                  y2={y}
                  stroke={track.color}
                  strokeWidth={1}
                  opacity={0.3}
                />
                {/* track label */}
                <text
                  x={TOKENS.leftPadding - 12}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="central"
                  fill={track.color}
                  fontFamily="'Barlow Condensed', sans-serif"
                  fontWeight={500}
                  fontSize={14}
                >
                  {track.person}
                </text>
              </g>
            );
          })}

          {/* timeline axis */}
          <line
            x1={TOKENS.leftPadding}
            y1={axisY}
            x2={canvasWidth - TOKENS.rightPadding}
            y2={axisY}
            stroke={TOKENS.secondary}
            strokeWidth={1}
            opacity={0.3}
          />
          {yearTicks.map((yr) => {
            const x = yearToX(yr);
            const isMajor = yr === Math.floor(yr);
            return (
              <g key={yr}>
                <line x1={x} y1={axisY} x2={x} y2={axisY + (isMajor ? 8 : 4)} stroke={TOKENS.secondary} strokeWidth={1} opacity={0.4} />
                {isMajor && (
                  <text
                    x={x}
                    y={axisY + 20}
                    textAnchor="middle"
                    fill={TOKENS.secondary}
                    fontFamily="'Space Mono', monospace"
                    fontSize={11}
                    opacity={0.6}
                  >
                    {yr}
                  </text>
                )}
              </g>
            );
          })}

          {/* connections */}
          {connections.map((conn) => {
            const fromPos = getNodePos(conn.fromNodeId);
            const toPos = getNodePos(conn.toNodeId);
            if (!fromPos || !toPos) return null;
            const path = buildConnectionPath(fromPos, toPos);
            const fromNode = nodes.find((n) => n.id === conn.fromNodeId);
            const fromTrack = fromNode ? tracks.find((t) => t.person === fromNode.person) : null;
            const color = fromTrack?.color || TOKENS.accent;
            const midX = (fromPos.x + toPos.x) / 2;
            const midY = (fromPos.y + toPos.y) / 2;

            const shouldAnimate = !animatedConnsRef.current.has(conn.id);
            if (shouldAnimate) animatedConnsRef.current.add(conn.id);

            return (
              <g key={conn.id}>
                {/* hit area for right-click */}
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={12}
                  onContextMenu={(e) => handleConnectionContextMenu(e, conn.id)}
                  style={{ cursor: "pointer" }}
                />
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray={shouldAnimate ? "2000" : "none"}
                  strokeDashoffset="0"
                  className={shouldAnimate ? "tc-conn-path" : undefined}
                  opacity={0.7}
                  onContextMenu={(e) => handleConnectionContextMenu(e, conn.id)}
                  style={{ cursor: "pointer", pointerEvents: "stroke" }}
                />
                {/* connection label */}
                <text
                  x={midX}
                  y={midY - 6}
                  textAnchor="middle"
                  fill={color}
                  fontFamily="'Space Mono', monospace"
                  fontSize={10}
                  fontWeight={700}
                  opacity={0.8}
                  onContextMenu={(e) => handleConnectionContextMenu(e, conn.id)}
                  style={{ cursor: "pointer" }}
                >
                  {conn.label}
                </text>
              </g>
            );
          })}

          {/* branches */}
          {branches.map((branch) => {
            const fromPos = getNodePos(branch.fromNodeId);
            if (!fromPos) return null;
            const len = 80;
            const angle = -30 * (Math.PI / 180);
            const toX = fromPos.x + len * Math.cos(angle);
            const toY = fromPos.y + len * Math.sin(angle);

            return (
              <g key={branch.id}>
                <line
                  x1={fromPos.x}
                  y1={fromPos.y}
                  x2={toX}
                  y2={toY}
                  stroke={TOKENS.secondary}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.5}
                  onDoubleClick={(e) => handleBranchDoubleClick(e, branch.id)}
                  style={{ cursor: "pointer" }}
                />
                {/* wider hit area for the branch line */}
                <line
                  x1={fromPos.x}
                  y1={fromPos.y}
                  x2={toX}
                  y2={toY}
                  stroke="transparent"
                  strokeWidth={10}
                  onDoubleClick={(e) => handleBranchDoubleClick(e, branch.id)}
                  style={{ cursor: "pointer" }}
                />
                {/* branch fading end (gradient via opacity) */}
                <circle cx={toX} cy={toY} r={3} fill={TOKENS.secondary} opacity={0.2} />
                {editingBranchId === branch.id ? (
                  <foreignObject x={toX + 4} y={toY - 12} width={120} height={24}>
                    <input
                      type="text"
                      value={editingBranchValue}
                      onChange={(e) => setEditingBranchValue(e.target.value)}
                      onBlur={handleBranchEditSubmit}
                      onKeyDown={(e) => { if (e.key === "Enter") handleBranchEditSubmit(); }}
                      autoFocus
                      style={{
                        background: "#fff",
                        border: `1px solid ${TOKENS.secondary}`,
                        fontFamily: "'Space Mono', monospace",
                        fontSize: "10px",
                        padding: "2px 4px",
                        width: "100%",
                        borderRadius: 0,
                      }}
                    />
                  </foreignObject>
                ) : (
                  <text
                    x={toX + 6}
                    y={toY}
                    fill={TOKENS.secondary}
                    fontFamily="'Space Mono', monospace"
                    fontSize={10}
                    opacity={0.6}
                    dominantBaseline="central"
                    onDoubleClick={(e) => handleBranchDoubleClick(e, branch.id)}
                    style={{ cursor: "pointer" }}
                  >
                    {branch.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* live connection preview */}
          {interactionState === "DRAWING_CONNECTION" && dragSourceNodeId && cursorPos && (() => {
            const fromPos = getNodePos(dragSourceNodeId);
            if (!fromPos) return null;
            const path = buildConnectionPath(fromPos, cursorPos);
            return (
              <path
                d={path}
                fill="none"
                stroke={TOKENS.accent}
                strokeWidth={2}
                strokeDasharray="6 4"
                opacity={0.5}
              />
            );
          })()}

          {/* nodes */}
          {nodes.map((nd) => {
            const ti = getTrackIndex(nd.person);
            if (ti < 0) return null;
            const x = yearToX(nd.year);
            const y = trackY(ti);
            const track = tracks[ti];
            const isActive = selectedNodeId === nd.id;
            const isBeingDragged = draggingNodeId === nd.id;
            const fillColor = isActive || isBeingDragged ? track.color : "#fff";
            const strokeColor = track.color;
            const textColor = isActive || isBeingDragged ? "#fff" : track.color;

            return (
              <g
                key={nd.id}
                style={{ cursor: isBeingDragged ? "grabbing" : "pointer", transition: isBeingDragged ? "none" : TOKENS.transition }}
                onMouseDown={(e) => handleNodeMouseDown(e, nd.id)}
                onDoubleClick={(e) => handleNodeDoubleClick(e, nd.id)}
                onContextMenu={(e) => handleNodeContextMenu(e, nd.id)}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={TOKENS.nodeRadius}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={2}
                />
                {/* node year label inside */}
                <text
                  x={x}
                  y={y + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={textColor}
                  fontFamily="'Space Mono', monospace"
                  fontSize={10}
                  fontWeight={700}
                  pointerEvents="none"
                >
                  {nd.year}
                </text>
                {/* node label above */}
                <text
                  x={x}
                  y={y - TOKENS.nodeRadius - 6}
                  textAnchor="middle"
                  fill={track.color}
                  fontFamily="'Barlow Condensed', sans-serif"
                  fontWeight={500}
                  fontSize={11}
                  pointerEvents="none"
                  opacity={0.8}
                >
                  {nd.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* ─── inline new-person input (HTML overlay) ─── */}
        {newPersonInput && (
          <div
            style={{
              position: "fixed",
              left: newPersonInput.x,
              top: newPersonInput.y,
              zIndex: 1000,
            }}
          >
            <input
              type="text"
              placeholder="Person name..."
              value={newPersonInput.value}
              autoFocus
              onChange={(e) => setNewPersonInput((p) => ({ ...p, value: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNewPersonSubmit(newPersonInput.value);
                if (e.key === "Escape") setNewPersonInput(null);
              }}
              onBlur={() => handleNewPersonSubmit(newPersonInput.value)}
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: "13px",
                padding: "4px 8px",
                border: `2px solid ${TOKENS.accent}`,
                background: "#fff",
                borderRadius: 0,
                outline: "none",
                minWidth: "160px",
              }}
            />
          </div>
        )}

        {/* ─── context menu (HTML overlay) ─── */}
        {contextMenu && (
          <div
            style={{
              position: "fixed",
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 1000,
              background: "#fff",
              border: `1px solid ${TOKENS.secondary}`,
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 500,
              fontSize: "13px",
              minWidth: "140px",
            }}
          >
            {contextMenu.type === "node" && (
              <div
                style={{ padding: "6px 12px", cursor: "pointer", borderBottom: "1px solid #eee" }}
                onClick={() => handleDeleteNode(contextMenu.id)}
                onMouseEnter={(e) => (e.target.style.background = "#f5f5f5")}
                onMouseLeave={(e) => (e.target.style.background = "#fff")}
              >
                Delete node
              </div>
            )}
            {contextMenu.type === "connection" && (
              <div
                style={{ padding: "6px 12px", cursor: "pointer", borderBottom: "1px solid #eee" }}
                onClick={() => handleDeleteConnection(contextMenu.id)}
                onMouseEnter={(e) => (e.target.style.background = "#f5f5f5")}
                onMouseLeave={(e) => (e.target.style.background = "#fff")}
              >
                Delete connection
              </div>
            )}
            <div
              style={{ padding: "6px 12px", cursor: "pointer" }}
              onClick={() => setContextMenu(null)}
              onMouseEnter={(e) => (e.target.style.background = "#f5f5f5")}
              onMouseLeave={(e) => (e.target.style.background = "#fff")}
            >
              Cancel
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
import React, { useEffect, useState } from "react";
import Icon, { type IconName } from "../Icon";
import { Avatar, IconBadge, Tabs } from "../ui";
import { BarChart } from "../charts";
import {
  getReportsSummary,
  getAreaConnectionStats,
  type AgentCollectionReport,
  type ReportsSummary,
  type AreaConnectionStats,
} from "@/lib/db/reports";
import { getAreas } from "@/lib/db/areas";
import {
  REPORT_TYPES,
  buildCsv,
  getCurrentReportMonth,
  getReportChart,
  normalizeReportMonth,
  type ReportType,
} from "@/lib/reports/core";
import type { Area } from "@/types/database";

type Period = "This Month" | "Last Month" | "Custom";

const PERIODS: { value: Period; label: string }[] = [
  { value: "This Month", label: "This Month" },
  { value: "Last Month", label: "Last Month" },
  { value: "Custom", label: "Custom" },
];

function previousMonth(month: string): string {
  const [year, monthNumber] = normalizeReportMonth(month)
    .split("-")
    .map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 2, 1));
  return date.toISOString().slice(0, 7);
}

function fmtCurrency(value: number): string {
  return `Rs. ${value.toLocaleString()}`;
}

function fmtValue(report: ReportType, value: number): string {
  return report === "Revenue" || report === "Collections"
    ? fmtCurrency(value)
    : value.toLocaleString();
}

function totalForReport(summary: ReportsSummary, report: ReportType): number {
  if (report === "Revenue") return summary.cards.revenue;
  if (report === "Collections") return summary.cards.collections;
  if (report === "Complaints") return summary.cards.complaints;
  return summary.cards.customers;
}

function safeRate(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildReportRows(
  summary: ReportsSummary,
  report: ReportType,
  areaName: string,
) {
  const chart = getReportChart(summary, report);

  return [
    ["PowerNet Manager Report"],
    ["Month", summary.month],
    ["Area", areaName],
    ["Report", report],
    [],
    ["Metric", "Value"],
    ["Total billed revenue", summary.cards.revenue],
    ["Collected payments", summary.cards.collections],
    ["Pending receivables", summary.cards.pending],
    ["Complaints opened", summary.cards.complaints],
    ["Customers at month-end", summary.cards.customers],
    ["Net customer growth", summary.cards.growth],
    [],
    [chart.label],
    ["Label", "Value"],
    ...chart.data.map((point) => [point.d, point.v]),
    [],
    ["Agent-wise Collection Breakdown"],
    ["Agent", "Area", "Payments", "Collected", "Pending", "Collection Rate %"],
    ...summary.agentCollections.map((agent) => [
      agent.name,
      agent.area,
      agent.payments,
      agent.collected,
      agent.pending,
      agent.collectionRate,
    ]),
  ];
}

function AgentRow({ agent }: { agent: AgentCollectionReport }) {
  const rate = safeRate(agent.collectionRate);

  return (
    <tr>
      <td>
        <div className="cell-user">
          <Avatar name={agent.name} size={28} />
          <div className="nm">{agent.name}</div>
        </div>
      </td>
      <td>{agent.area}</td>
      <td className="num">{agent.payments}</td>
      <td className="num" style={{ fontWeight: 600 }}>
        {fmtCurrency(agent.collected)}
      </td>
      <td
        className="num"
        style={{ color: agent.pending > 0 ? "var(--amber)" : "var(--green)" }}
      >
        {fmtCurrency(agent.pending)}
      </td>
      <td>
        <div className="row gap-sm" style={{ minWidth: 140 }}>
          <div className="progress" style={{ flex: 1 }}>
            <span
              style={{
                width: `${rate}%`,
                background:
                  rate > 85
                    ? "var(--green)"
                    : rate > 70
                      ? "var(--blue)"
                      : "var(--amber)",
              }}
            />
          </div>
          <span
            className="num"
            style={{ fontSize: 12, fontWeight: 600, minWidth: 32 }}
          >
            {rate}%
          </span>
        </div>
      </td>
    </tr>
  );
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>("This Month");
  const [report, setReport] = useState<ReportType>("Revenue");
  const [reportMonth, setReportMonth] = useState(getCurrentReportMonth());
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaFilter, setAreaFilter] = useState("");
  const [areaStats, setAreaStats] = useState<AreaConnectionStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Dashboard states for Area Connections report
  const [connSearch, setConnSearch] = useState("");
  const [connSortField, setConnSortField] = useState<
    "areaName" | "activeConnections" | "inactiveConnections" | "totalConnections" | "ratio"
  >("areaName");
  const [connSortOrder, setConnSortOrder] = useState<"asc" | "desc">("asc");
  const [connView, setConnView] = useState<"table" | "chart">("table");

  // Filter & Sort areaStats
  const filteredAndSortedStats = React.useMemo(() => {
    let result = [...areaStats];

    // Search filter
    if (connSearch.trim()) {
      const q = connSearch.toLowerCase().trim();
      result = result.filter((item) => item.areaName.toLowerCase().includes(q));
    }

    // Sorting
    result.sort((a, b) => {
      if (connSortField === "areaName") {
        return connSortOrder === "asc"
          ? a.areaName.localeCompare(b.areaName)
          : b.areaName.localeCompare(a.areaName);
      }

      let aVal = 0;
      let bVal = 0;

      if (connSortField === "activeConnections") {
        aVal = a.activeConnections;
        bVal = b.activeConnections;
      } else if (connSortField === "inactiveConnections") {
        aVal = a.inactiveConnections;
        bVal = b.inactiveConnections;
      } else if (connSortField === "totalConnections") {
        aVal = a.totalConnections;
        bVal = b.totalConnections;
      } else if (connSortField === "ratio") {
        aVal = a.totalConnections > 0 ? a.activeConnections / a.totalConnections : 0;
        bVal = b.totalConnections > 0 ? b.activeConnections / b.totalConnections : 0;
      }

      return connSortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });

    return result;
  }, [areaStats, connSearch, connSortField, connSortOrder]);

  // Aggregate stats
  const aggregateConnStats = React.useMemo(() => {
    let totalConnections = 0;
    let activeConnections = 0;
    let inactiveConnections = 0;

    areaStats.forEach((stat) => {
      totalConnections += stat.totalConnections;
      activeConnections += stat.activeConnections;
      inactiveConnections += stat.inactiveConnections;
    });

    const ratio = totalConnections > 0 ? Math.round((activeConnections / totalConnections) * 100) : 0;

    return {
      totalConnections,
      activeConnections,
      inactiveConnections,
      ratio,
      totalAreas: areaStats.length,
    };
  }, [areaStats]);

  useEffect(() => {
    async function loadAreas() {
      try {
        const data = await getAreas();
        setAreas(data);
      } catch (e) {
        console.error("Failed to load areas:", e);
      }
    }
    loadAreas();
  }, []);

  useEffect(() => {
    let active = true;

    async function loadReports() {
      setLoading(true);
      setError(null);
      setSummary(null);
      try {
        const [data, connStats] = await Promise.all([
          getReportsSummary(reportMonth, areaFilter || undefined),
          getAreaConnectionStats(),
        ]);
        if (active) setSummary(data);
        if (active) setAreaStats(connStats);
      } catch (e: unknown) {
        if (active)
          setError(e instanceof Error ? e.message : "Could not load reports");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadReports();
    return () => {
      active = false;
    };
  }, [reportMonth, areaFilter, reloadToken]);

  const handlePeriodChange = (value: string) => {
    const nextPeriod = value as Period;
    setPeriod(nextPeriod);

    if (nextPeriod === "This Month") setReportMonth(getCurrentReportMonth());
    if (nextPeriod === "Last Month")
      setReportMonth(previousMonth(getCurrentReportMonth()));
  };

  const handleReportChange = (value: string) => {
    if (REPORT_TYPES.includes(value as ReportType))
      setReport(value as ReportType);
  };

  const handleMonthChange = (value: string) => {
    setPeriod("Custom");
    setReportMonth(value);
  };

  const handleExportCsv = () => {
    if (!summary) return;
    const areaName = areaFilter
      ? (areas.find((a) => a.id === areaFilter)?.name ?? "selected-area")
      : "All Areas";
    const csv = buildCsv(buildReportRows(summary, report, areaName));
    downloadTextFile(
      `powernet-${report.toLowerCase()}-${summary.month}-${areaName.toLowerCase().replace(/\s+/g, "-")}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  };

  const handleExportAreaCsv = () => {
    if (filteredAndSortedStats.length === 0) return;
    const csvRows = [
      ["PowerNet Area-wise Connection Summary"],
      ["Generated At", new Date().toLocaleString()],
      ["Search Query", connSearch || "None"],
      ["Sorted By", `${connSortField} (${connSortOrder})`],
      [],
      ["Area", "Active Connections", "Inactive Connections", "Total Connections", "Active Ratio %"],
      ...filteredAndSortedStats.map((stat) => {
        const total = stat.totalConnections;
        const active = stat.activeConnections;
        const rate = total > 0 ? Math.round((active / total) * 100) : 0;
        return [
          stat.areaName,
          stat.activeConnections,
          stat.inactiveConnections,
          stat.totalConnections,
          `${rate}%`,
        ];
      }),
    ];
    const csv = buildCsv(csvRows);
    downloadTextFile(
      `powernet-area-connections-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  };

  if (loading && !summary)
    return (
      <div
        className="page"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
        }}
      >
        <div className="muted">Loading live reports...</div>
      </div>
    );

  if (error && !summary)
    return (
      <div className="page">
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Reports load failed
          </div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setReloadToken((t) => t + 1)}
          >
            <Icon name="refresh" size={14} />
            Retry
          </button>
        </div>
      </div>
    );

  if (!summary) return null;

  const current = getReportChart(summary, report);
  const chartData = current.data.length > 0 ? current.data : [{ d: "-", v: 0 }];
  const selectedTotal = totalForReport(summary, report);
  const areaName = areaFilter
    ? (areas.find((a) => a.id === areaFilter)?.name ?? "Selected Area")
    : "All Areas";
  const stats: {
    label: string;
    value: string;
    color: string;
    icon: IconName;
  }[] = [
    {
      label: "Billed Revenue",
      value: fmtCurrency(summary.cards.revenue),
      color: "blue",
      icon: "fileText",
    },
    {
      label: "Collections",
      value: fmtCurrency(summary.cards.collections),
      color: "green",
      icon: "cash",
    },
    {
      label: "Pending",
      value: fmtCurrency(summary.cards.pending),
      color: "amber",
      icon: "clock",
    },
    {
      label: "Customers",
      value: summary.cards.customers.toLocaleString(),
      color: "purple",
      icon: "users",
    },
    {
      label: "Net Growth",
      value: summary.cards.growth.toLocaleString(),
      color: "green",
      icon: "trend",
    },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p>
            Live analytics and exports across revenue, collections, complaints
            and customer growth
          </p>
        </div>
        <div className="row gap-sm">
          <Tabs value={period} onChange={handlePeriodChange} items={PERIODS} />
          <input
            className="select"
            type="month"
            value={reportMonth}
            onChange={(e) => handleMonthChange(e.target.value)}
            style={{ width: 150 }}
          />
          <select
            className="select"
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            style={{ width: 170 }}
          >
            <option value="">All Areas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            onClick={() => setReloadToken((t) => t + 1)}
            disabled={loading}
          >
            <Icon name="refresh" size={14} />
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="card"
          style={{
            padding: "10px 14px",
            marginBottom: 14,
            color: "#dc2626",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="card card-pad"
            style={{ display: "flex", alignItems: "center", gap: 14 }}
          >
            <IconBadge name={stat.icon} color={stat.color} size={40} />
            <div style={{ flex: 1 }}>
              <div
                className="muted"
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 600,
                }}
              >
                {stat.label}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  marginTop: 2,
                }}
                className="num"
              >
                {stat.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <Tabs
          value={report}
          onChange={handleReportChange}
          items={REPORT_TYPES.map((type) => ({ value: type, label: type }))}
        />
        <div style={{ flex: 1 }} />
        <div className="row gap-sm">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => window.print()}
          >
            <Icon name="download" size={12} />
            PDF
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportCsv}
          >
            <Icon name="download" size={12} />
            Excel
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <div>
            <h3>{current.label}</h3>
            <div className="sub">
              {summary.month} cycle - {areaName} - live Supabase summary
            </div>
          </div>
          <div className="row gap-md">
            <div>
              <div
                className="muted"
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 600,
                }}
              >
                Total
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                }}
                className="num"
              >
                {fmtValue(report, selectedTotal)}
              </div>
            </div>
            <div>
              <div
                className="muted"
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 600,
                }}
              >
                Source
              </div>
              <div
                style={{ fontSize: 14, fontWeight: 600, color: "var(--green)" }}
              >
                Live DB
              </div>
            </div>
          </div>
        </div>
        <div className="card-pad" style={{ paddingTop: 8 }}>
          <BarChart
            data={chartData}
            accent={current.accent}
            unit={current.unit}
            height={260}
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <div>
            <h3>Agent-wise Collection Breakdown</h3>
            <div className="sub">
              Payments, pending amount and collection rate for {summary.month}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleExportCsv}>
            <Icon name="download" size={12} />
            Export table
          </button>
        </div>
        <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Area</th>
                <th>Payments</th>
                <th>Collected</th>
                <th>Pending</th>
                <th>Collection Rate</th>
              </tr>
            </thead>
            <tbody>
              {summary.agentCollections.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: "center",
                      color: "var(--text-muted)",
                      padding: 28,
                    }}
                  >
                    No collection activity found for this month.
                  </td>
                </tr>
              ) : (
                summary.agentCollections.map((agent) => (
                  <AgentRow key={`${agent.name}-${agent.area}`} agent={agent} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        {/* Card Header */}
        <div className="card-head" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
          <div>
            <h3>Area-wise Connection Summary</h3>
            <div className="sub">
              Active and inactive subscribers count by operational area
            </div>
          </div>
          <div className="row gap-sm">
            <button
              className={`btn btn-secondary btn-sm ${connView === "table" ? "btn-primary" : ""}`}
              onClick={() => setConnView("table")}
              style={{ padding: "6px 12px", borderRadius: 4 }}
            >
              <Icon name="fileText" size={13} style={{ marginRight: 6 }} /> Table
            </button>
            <button
              className={`btn btn-secondary btn-sm ${connView === "chart" ? "btn-primary" : ""}`}
              onClick={() => setConnView("chart")}
              style={{ padding: "6px 12px", borderRadius: 4 }}
            >
              <Icon name="trend" size={13} style={{ marginRight: 6 }} /> Visual Chart
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleExportAreaCsv}
              style={{ marginLeft: 8 }}
            >
              <Icon name="download" size={12} style={{ marginRight: 4 }} /> Export
            </button>
          </div>
        </div>

        {/* Aggregate Stats Badges */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          padding: 16,
          background: "var(--background-soft)",
          borderBottom: "1px solid var(--border)"
        }}>
          <div style={{ padding: "10px 14px", borderRadius: 6, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
            <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 600 }}>Total Areas</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }} className="num">{aggregateConnStats.totalAreas}</div>
          </div>
          <div style={{ padding: "10px 14px", borderRadius: 6, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
            <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 600 }}>Active Connections</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: "var(--green)" }} className="num">
              {aggregateConnStats.activeConnections.toLocaleString()}
            </div>
          </div>
          <div style={{ padding: "10px 14px", borderRadius: 6, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
            <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 600 }}>Inactive Connections</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: "var(--text-muted)" }} className="num">
              {aggregateConnStats.inactiveConnections.toLocaleString()}
            </div>
          </div>
          <div style={{ padding: "10px 14px", borderRadius: 6, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
            <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 600 }}>Active Ratio</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: "var(--primary)" }} className="num">
              {aggregateConnStats.ratio}%
            </div>
          </div>
        </div>

        {/* Toolbar: Search & Sort info */}
        <div className="row gap-md" style={{ padding: 12, borderBottom: "1px solid var(--border)", background: "var(--card-bg)" }}>
          <div className="row gap-sm" style={{ flex: 1, maxWidth: 320 }}>
            <Icon name="search" size={14} style={{ marginLeft: 8, color: "var(--text-muted)" }} />
            <input
              type="text"
              placeholder="Search area..."
              className="select"
              value={connSearch}
              onChange={(e) => setConnSearch(e.target.value)}
              style={{
                flex: 1,
                border: "1px solid var(--border)",
                height: 32,
                borderRadius: 4,
                padding: "0 10px",
                fontSize: 13
              }}
            />
          </div>
          {connSearch && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setConnSearch("")}
              style={{ fontSize: 12, padding: "2px 8px" }}
            >
              Clear
            </button>
          )}
          <div style={{ flex: 1 }} />
          <div className="muted" style={{ fontSize: 12 }}>
            Showing {filteredAndSortedStats.length} of {areaStats.length} areas
          </div>
        </div>

        {/* Table View */}
        {connView === "table" && (
          <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
            <table className="data">
              <thead>
                <tr>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => {
                    if (connSortField === "areaName") {
                      setConnSortOrder(connSortOrder === "asc" ? "desc" : "asc");
                    } else {
                      setConnSortField("areaName");
                      setConnSortOrder("asc");
                    }
                  }}>
                    <div className="row gap-xs">
                      Area {connSortField === "areaName" && (connSortOrder === "asc" ? "▲" : "▼")}
                    </div>
                  </th>
                  <th className="num" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => {
                    if (connSortField === "activeConnections") {
                      setConnSortOrder(connSortOrder === "asc" ? "desc" : "asc");
                    } else {
                      setConnSortField("activeConnections");
                      setConnSortOrder("desc");
                    }
                  }}>
                    Active {connSortField === "activeConnections" && (connSortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="num" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => {
                    if (connSortField === "inactiveConnections") {
                      setConnSortOrder(connSortOrder === "asc" ? "desc" : "asc");
                    } else {
                      setConnSortField("inactiveConnections");
                      setConnSortOrder("desc");
                    }
                  }}>
                    Inactive {connSortField === "inactiveConnections" && (connSortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="num" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => {
                    if (connSortField === "totalConnections") {
                      setConnSortOrder(connSortOrder === "asc" ? "desc" : "asc");
                    } else {
                      setConnSortField("totalConnections");
                      setConnSortOrder("desc");
                    }
                  }}>
                    Total Connections {connSortField === "totalConnections" && (connSortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => {
                    if (connSortField === "ratio") {
                      setConnSortOrder(connSortOrder === "asc" ? "desc" : "asc");
                    } else {
                      setConnSortField("ratio");
                      setConnSortOrder("desc");
                    }
                  }}>
                    <div className="row gap-xs">
                      Active Ratio {connSortField === "ratio" && (connSortOrder === "asc" ? "▲" : "▼")}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedStats.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        textAlign: "center",
                        color: "var(--text-muted)",
                        padding: 36,
                      }}
                    >
                      No matching areas found.
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedStats.map((stat) => {
                    const total = stat.totalConnections;
                    const active = stat.activeConnections;
                    const rate = total > 0 ? Math.round((active / total) * 100) : 0;
                    return (
                      <tr key={stat.areaId}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{stat.areaName}</div>
                        </td>
                        <td className="num" style={{ color: "var(--green)", fontWeight: 600 }}>
                          {stat.activeConnections.toLocaleString()}
                        </td>
                        <td className="num" style={{ color: "var(--text-muted)" }}>
                          {stat.inactiveConnections.toLocaleString()}
                        </td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {stat.totalConnections.toLocaleString()}
                        </td>
                        <td>
                          <div className="row gap-sm" style={{ minWidth: 140 }}>
                            <div className="progress" style={{ flex: 1, height: 8 }}>
                              <span
                                style={{
                                  width: `${rate}%`,
                                  background:
                                    rate > 80
                                      ? "var(--green)"
                                      : rate > 50
                                        ? "var(--blue)"
                                        : "var(--amber)",
                                }}
                              />
                            </div>
                            <span
                              className="num"
                              style={{ fontSize: 12, fontWeight: 700, minWidth: 32 }}
                            >
                              {rate}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Visual Chart View */}
        {connView === "chart" && (
          <div style={{ padding: 20 }}>
            {filteredAndSortedStats.length === 0 ? (
              <div className="muted" style={{ textAlign: "center", padding: 36 }}>
                No matching area charts to display.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {filteredAndSortedStats.map((stat) => {
                  const total = stat.totalConnections;
                  const active = stat.activeConnections;
                  const inactive = stat.inactiveConnections;
                  const activePct = total > 0 ? Math.round((active / total) * 100) : 0;
                  const inactivePct = total > 0 ? 100 - activePct : 0;

                  return (
                    <div key={stat.areaId} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div className="row" style={{ justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                        <div>{stat.areaName}</div>
                        <div className="row gap-sm num" style={{ fontSize: 12 }}>
                          <span style={{ color: "var(--green)" }}>{active} Active</span>
                          <span className="muted">•</span>
                          <span style={{ color: "var(--text-muted)" }}>{inactive} Inactive</span>
                          <span className="muted">•</span>
                          <span style={{ fontWeight: 700 }}>{total} Total</span>
                        </div>
                      </div>
                      
                      {/* Horizontal Stacked Bar */}
                      <div style={{
                        height: 18,
                        width: "100%",
                        borderRadius: 4,
                        overflow: "hidden",
                        display: "flex",
                        background: "var(--border)",
                        border: "1px solid var(--border)"
                      }}>
                        {active > 0 && (
                          <div
                            style={{
                              width: `${activePct}%`,
                              background: "var(--green)",
                              color: "#fff",
                              fontSize: 10,
                              fontWeight: 700,
                              display: "flex",
                              alignItems: "center",
                              paddingLeft: 6,
                              whiteSpace: "nowrap",
                              overflow: "hidden"
                            }}
                            title={`Active: ${activePct}%`}
                          >
                            {activePct >= 10 && `${activePct}%`}
                          </div>
                        )}
                        {inactive > 0 && (
                          <div
                            style={{
                              width: `${inactivePct}%`,
                              background: "var(--text-muted)",
                              opacity: 0.65,
                              color: "#fff",
                              fontSize: 10,
                              fontWeight: 700,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              paddingRight: 6,
                              whiteSpace: "nowrap",
                              overflow: "hidden"
                            }}
                            title={`Inactive: ${inactivePct}%`}
                          >
                            {inactivePct >= 10 && `${inactivePct}%`}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

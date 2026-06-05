import json
import networkx as nx
from networkx.readwrite import json_graph
from graphify.build import prefix_graph_for_global
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json, to_html
from pathlib import Path

FLUTTER_JSON = Path('e:/Power Net Manager/PowerNet Staff App/graphify-out/graph.json')
DASH_JSON    = Path('e:/Power Net Manager/PowerNet Manager/graphify-out/graph.json')
OUT_DIR      = Path('e:/Power Net Manager/graphify-out')

flutter_data = json.loads(FLUTTER_JSON.read_text(encoding='utf-8'))
dash_data    = json.loads(DASH_JSON.read_text(encoding='utf-8'))

# Load as networkx graphs from node-link format (graphify uses 'links' not 'edges')
Gf = json_graph.node_link_graph(flutter_data, edges='links')
Gd = json_graph.node_link_graph(dash_data, edges='links')

print(f"Flutter graph: {Gf.number_of_nodes()} nodes, {Gf.number_of_edges()} edges")
print(f"Dashboard graph: {Gd.number_of_nodes()} nodes, {Gd.number_of_edges()} edges")

# Prefix nodes to avoid ID collisions
Gf_prefixed = prefix_graph_for_global(Gf, 'flutter')
Gd_prefixed = prefix_graph_for_global(Gd, 'dashboard')

# Merge into single graph
G = nx.compose(Gf_prefixed, Gd_prefixed)

# Find real node IDs to connect cross-project edges
flutter_nodes = {G.nodes[n].get('label', '').lower(): n for n in G.nodes if n.startswith('flutter:')}
dash_nodes    = {G.nodes[n].get('label', '').lower(): n for n in G.nodes if n.startswith('dashboard:')}

def find_node(nodes_dict, *keywords):
    for label, nid in nodes_dict.items():
        if all(k in label for k in keywords):
            return nid
    return None

# Build cross-project edges using actual node IDs
cross_connections = [
    (find_node(flutter_nodes, 'bills_repository'), find_node(dash_nodes, 'bills'),
     'shares_supabase_table', 0.95, 'Both access Supabase bills table via PostgREST'),
    (find_node(flutter_nodes, 'bills_provider'), find_node(dash_nodes, 'billingpage'),
     'mirrors_billing_domain', 0.85, 'Both manage billing state for same ISP operation'),
    (find_node(flutter_nodes, 'collect_payment'), find_node(dash_nodes, 'getbillspage'),
     'payment_reflects_in', 0.95, 'Payments from Flutter app appear in dashboard billing view'),
    (find_node(flutter_nodes, 'supabase_config'), find_node(dash_nodes, 'supabase'),
     'same_supabase_project', 1.0, 'Both connect to same Supabase project'),
    (find_node(flutter_nodes, 'bill'), find_node(dash_nodes, 'bill'),
     'mirrors_schema', 0.95, 'Flutter Bill model and TS Bill type map to same DB table'),
    (find_node(flutter_nodes, 'area'), find_node(dash_nodes, 'area'),
     'mirrors_schema', 0.95, 'Same areas table in Supabase'),
    (find_node(flutter_nodes, 'auth'), find_node(dash_nodes, 'useauth'),
     'same_auth_system', 0.85, 'Both use Supabase Auth for staff login'),
]

added = 0
for src, tgt, label, conf, note in cross_connections:
    if src and tgt and G.has_node(src) and G.has_node(tgt):
        G.add_edge(src, tgt, label=label, type='INFERRED', confidence_score=conf, note=note)
        print(f"  Cross-edge: {G.nodes[src].get('label')} -> {G.nodes[tgt].get('label')} [{label}]")
        added += 1
    else:
        missing_src = src if src else 'NOT FOUND'
        missing_tgt = tgt if tgt else 'NOT FOUND'
        print(f"  Skipped edge {label}: src={missing_src}, tgt={missing_tgt}")

print(f"\nCombined graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges ({added} cross-project edges added)")

communities = cluster(G)
cohesion    = score_all(G, communities)
gods        = god_nodes(G)
surprises   = surprising_connections(G, communities)

labels = {cid: f'Community {cid}' for cid in communities}

for cid, members in communities.items():
    member_labels = [G.nodes[n].get('label', '') for n in members if n in G.nodes]
    combined = ' '.join(member_labels).lower()
    if 'supabase' in combined and 'bills' in combined:
        labels[cid] = 'Billing & Data Layer'
    elif 'billing' in combined or 'payment' in combined:
        labels[cid] = 'Payment Processing'
    elif 'auth' in combined or 'login' in combined:
        labels[cid] = 'Authentication'
    elif 'area' in combined or 'customer' in combined:
        labels[cid] = 'Customer & Area Management'
    elif 'flutter' in combined or 'material' in combined or 'provider' in combined:
        labels[cid] = 'Flutter App Core'
    elif 'dashboard' in combined or 'app.tsx' in combined or 'sidebar' in combined:
        labels[cid] = 'Dashboard Shell'
    elif 'complaint' in combined:
        labels[cid] = 'Complaints'
    elif 'staff' in combined:
        labels[cid] = 'Staff Management'

questions = suggest_questions(G, communities, labels)

detection_combined = {
    'total_files': 0,
    'total_words': 0,
    'files': {},
    'source_path': 'e:/Power Net Manager',
}

report = generate(
    G, communities, cohesion, labels, gods, surprises,
    detection_combined, {'input': 0, 'output': 0},
    'e:/Power Net Manager',
    suggested_questions=questions,
)
(OUT_DIR / 'GRAPH_REPORT.md').write_text(report, encoding='utf-8')
print('GRAPH_REPORT.md written')

to_json(G, communities, str(OUT_DIR / 'graph.json'))
print('graph.json written')

to_html(G, communities, str(OUT_DIR / 'graph.html'), community_labels=labels)
print('graph.html written')

print(f'\nGod nodes (top 10): {[g["label"] for g in gods[:10]]}')
print(f'Communities ({len(communities)}):')
for cid, label in labels.items():
    print(f'  {cid}: {label}')

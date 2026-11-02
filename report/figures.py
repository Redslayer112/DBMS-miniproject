import os, re, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, "figures")
sql = open(os.path.join(ROOT, "docs/schema.sql")).read()

tables = {}
for name, body in re.findall(r"CREATE TABLE (\w+) \((.*?)\n\) ENGINE", sql, re.S):
    cols, pk, fks = [], set(), {}
    for l in body.split("\n"):
        l = l.strip().rstrip(",")
        m = re.match(r"(\w+) (BIGINT|VARCHAR|DECIMAL|DATETIME|BOOLEAN|ENUM)", l)
        if m and not l.startswith("CONSTRAINT"):
            cols.append(m.group(1))
            if "PRIMARY KEY" in l:
                pk.add(m.group(1))
        m = re.match(r"PRIMARY KEY \((.*)\)", l)
        if m:
            pk |= {c.strip() for c in m.group(1).split(",")}
    for col, ref, rcol in re.findall(r"FOREIGN KEY \((\w+)\) REFERENCES (\w+) \((\w+)\)", body):
        fks[col] = (ref, rcol)
    tables[name] = (cols, pk, fks)

dot = ['digraph R {', 'rankdir=LR; nodesep=0.35; ranksep=1.1; splines=true;',
       'node [shape=plain fontname="Quicksand Medium" fontsize=11];',
       'edge [color="#444444" arrowsize=0.7];']
for t, (cols, pk, fks) in tables.items():
    rows = [f'<tr><td bgcolor="#d9d9d9"><b>{t}</b></td></tr>']
    for c in cols:
        label = (f"<u><i>{c}</i></u>" if c in fks else f"<u>{c}</u>") if c in pk else f"<i>{c}</i>" if c in fks else c
        rows.append(f'<tr><td port="{c}" align="left">{label}</td></tr>')
    dot.append(f'{t} [label=<<table border="0" cellborder="1" cellspacing="0" cellpadding="4">{"".join(rows)}</table>>];')
for t, (cols, pk, fks) in tables.items():
    for c, (ref, rcol) in fks.items():
        dot.append(f"{t}:{c} -> {ref}:{rcol};")
dot.append("}")
subprocess.run(["dot", "-Tpng", "-Gdpi=200", "-o", os.path.join(OUT, "relational.png")], input="\n".join(dot), text=True, check=True)

arch = '''digraph A {
rankdir=TB; nodesep=0.5; ranksep=0.45;
node [shape=box style=rounded fontname="Quicksand Medium" fontsize=12 margin="0.25,0.12"];
edge [fontname="Quicksand Medium" fontsize=10 color="#444444"];
ui [label="Browser\\nReact dashboards: Restaurant, NGO, Volunteer, Admin"];
api [label="Next.js Route Handlers (app/api)\\nJWT session check, role check, input validation (zod)"];
lib [label="lib/db.ts  lib/auth.ts  lib/matching.ts\\nparameterised SQL, explicit transactions"];
my [label="MySQL 8 (InnoDB)\\n14 tables, 3 triggers, 1 procedure, 1 function, 6 views"];
mg [label="MongoDB 7\\ndonation_operational_notes"];
ui -> api [label=" HTTPS JSON, httpOnly cookie"];
api -> lib;
lib -> my [label=" mysql2 pool"];
lib -> mg [label=" MongoDB driver"];
}'''
subprocess.run(["dot", "-Tpng", "-Gdpi=200", "-o", os.path.join(OUT, "architecture.png")], input=arch, text=True, check=True)
for t, (cols, pk, fks) in tables.items():
    print(t, len(cols), sorted(pk), fks)

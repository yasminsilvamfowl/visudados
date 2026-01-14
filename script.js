async function main() {
    
    // --- 1. CARREGAR DADOS ---
    const rawData = await d3.csv("eurepoc_dyadic_dataset_0_1.csv");
    
    // Mapa Mundi via CDN (para garantir que funcione sem arquivo extra)
    const world = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
    const worldData = topojson.feature(world, world.objects.countries);


    // --- 2. LIMPEZA E TRATAMENTO ---
    const ignorar = ["Not available", "Unknown", "Other", "nan", ""];
    
    const dadosConflitos = rawData.map(d => {
        // Data
        let start = null;
        if (d.start_date && d.start_date.toLowerCase() !== "not available") {
            const cleanStr = d.start_date.replace(" ", "T");
            const date = new Date(cleanStr);
            if (!isNaN(date)) start = date;
        }

        // Tipos de Operação
        const opsRaw = d.operation_type || "";
        const opsLimpos = opsRaw.replace(/[\[\]'"]/g, "").split(/[;,]/)
            .map(s => s.trim())
            .filter(s => s && !ignorar.includes(s));

        // Subcategoria
        const subRaw = d.receiver_subcategory || "";
        
        return {
            id: d.incident_id,
            data: start,
            ano: start ? start.getFullYear() : null,
            atacante: d.initiator_country || "Unknown",
            vitima: d.receiver_country || "Unknown",
            alvo_cru: subRaw,
            tipos_lista: opsLimpos
        };
    }).filter(d => d.data !== null && d.ano >= 2005);


    // --- FUNÇÃO AJUDANTE DE RENDERIZAÇÃO (CORRIGIDA) ---
    const widthPadrao = 600;

    function renderChart(id, chartNode) {
        const div = document.getElementById(id);
        if(div) {
            // CORREÇÃO CRUCIAL: Só desenha se a div estiver vazia.
            // Isso impede que o gráfico "resete" ou exploda ao rolar a tela.
            if (div.innerHTML === "") {
                div.appendChild(chartNode);
            }
        }
    }


    // =========================================================
    // GRÁFICO 1: MAPA (Cores ajustadas)
    // =========================================================
    const vitimasCount = d3.rollup(dadosConflitos, v => v.length, d => {
        if (d.vitima === "United States") return "United States of America";
        if (d.vitima.includes("Russia")) return "Russian Federation";
        return d.vitima;
    });
    
    const plotMapa = Plot.plot({
        width: widthPadrao,
        projection: "equal-earth",
        // 'symlog' ajuda a não deixar um país muito vermelho e o resto branco
        color: { scheme: "Reds", type: "symlog", label: "Ataques Recebidos", legend: true },
        marks: [
            Plot.geo(worldData, {
                fill: d => vitimasCount.get(d.properties.name) || "#eee",
                stroke: "#ccc",
                tip: true,
                title: d => `${d.properties.name}: ${vitimasCount.get(d.properties.name) || 0}`
            }),
            Plot.graticule({strokeOpacity: 0.2})
        ]
    });
    renderChart("vis-mapa", plotMapa);


    // =========================================================
    // GRÁFICO 2: TEMPORAL
    // =========================================================
    const dadosPorAno = d3.groups(dadosConflitos, d => d.ano)
        .map(([ano, lista]) => ({ ano, qtd: lista.length }))
        .sort((a, b) => a.ano - b.ano);

    const plotTemporal = Plot.plot({
        width: widthPadrao,
        x: { label: "Ano", tickFormat: "d" },
        y: { label: "Incidentes", grid: true },
        marks: [
            Plot.lineY(dadosPorAno, {x: "ano", y: "qtd", stroke: "steelblue", strokeWidth: 3}),
            Plot.areaY(dadosPorAno, {x: "ano", y: "qtd", fill: "steelblue", fillOpacity: 0.1}),
            Plot.tip(dadosPorAno, Plot.pointerX({x: "ano", y: "qtd"}))
        ]
    });
    renderChart("vis-temporal", plotTemporal);


    // =========================================================
    // GRÁFICO 3: MÉTODOS (Com margem para números)
    // =========================================================
    const metodosFlat = dadosConflitos.flatMap(d => d.tipos_lista);
    const metodosCount = d3.rollup(metodosFlat, v => v.length, d => d);
    const dadosMetodos = Array.from(metodosCount, ([metodo, valor]) => ({metodo, valor}))
        .sort((a, b) => b.valor - a.valor).slice(0, 10);

    const plotBarras = Plot.plot({
        width: widthPadrao,
        marginLeft: 150,
        marginRight: 50, // Espaço extra na direita
        x: { label: "Frequência", grid: true },
        y: { label: null, domain: dadosMetodos.map(d => d.metodo) },
        marks: [
            Plot.barX(dadosMetodos, {x: "valor", y: "metodo", fill: "purple", tip: true}),
            Plot.text(dadosMetodos, {x: "valor", y: "metodo", text: "valor", dx: 5, textAnchor: "start"})
        ]
    });
    renderChart("vis-barras", plotBarras);


    // =========================================================
    // GRÁFICO 4: ORIGEM (Com margem para números)
    // =========================================================
    const origemCounts = d3.rollup(dadosConflitos, v => v.length, d => d.atacante);
    const dadosOrigem = Array.from(origemCounts, ([pais, valor]) => ({pais, valor}))
        .filter(d => d.pais !== "Unknown" && d.pais !== "Not attributed")
        .sort((a, b) => b.valor - a.valor).slice(0, 10);

    const plotOrigem = Plot.plot({
        width: widthPadrao,
        marginLeft: 150,
        marginRight: 50, // Espaço extra na direita
        x: { grid: true },
        y: { label: null, domain: dadosOrigem.map(d => d.pais) },
        marks: [
            Plot.barX(dadosOrigem, {x: "valor", y: "pais", fill: "tomato", tip: true}),
            Plot.text(dadosOrigem, {x: "valor", y: "pais", text: "valor", dx: 5, textAnchor: "start"})
        ]
    });
    renderChart("vis-origem", plotOrigem);


    // =========================================================
    // GRÁFICO 5: ALVOS (Com margem para números)
    // =========================================================
    const contagemAlvos = new Map();
    dadosConflitos.forEach(d => {
        let texto = d.alvo_cru;
        if (!texto || texto === "Not available" || texto === "Unknown") return;
        texto = texto.replace(/[\[\]'"]/g, "");
        const separador = texto.includes(",") ? "," : ";";
        texto.split(separador).map(s => s.trim()).forEach(item => {
            if (item && item !== "Not available" && item !== "Unknown" && item !== "Other") {
                contagemAlvos.set(item, (contagemAlvos.get(item) || 0) + 1);
            }
        });
    });

    const dadosAlvos = Array.from(contagemAlvos, ([nome, valor]) => ({nome, valor}))
        .sort((a, b) => b.valor - a.valor).slice(0, 10);

    const plotAlvos = Plot.plot({
        width: widthPadrao,
        marginLeft: 220,
        marginRight: 50, // Espaço extra na direita
        x: { label: "Incidentes", grid: true },
        y: { label: null, domain: dadosAlvos.map(d => d.nome) },
        marks: [
            Plot.barX(dadosAlvos, {x: "valor", y: "nome", fill: "teal", tip: true}),
            Plot.text(dadosAlvos, {x: "valor", y: "nome", text: "valor", dx: 5, textAnchor: "start"})
        ]
    });
    renderChart("vis-alvos", plotAlvos);


    // =========================================================
    // GRÁFICO 6: A TEIA (Versão Final Estável)
    // =========================================================
    const linksMap = d3.rollup(dadosConflitos, v => v.length, d => d.atacante, d => d.vitima);
    const links = [];
    const nodesSet = new Set();

    for (const [source, targets] of linksMap) {
        for (const [target, value] of targets) {
            if (value > 3 && source !== "Unknown" && target !== "Unknown" && source !== "Not attributed") {
                links.push({source, target, value});
                nodesSet.add(source);
                nodesSet.add(target);
            }
        }
    }
    const nodes = Array.from(nodesSet).map(id => ({id}));

    const heightRede = 400; // Altura ajustada
    const color = d3.scaleOrdinal(d3.schemeCategory10);

    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(50))
        .force("charge", d3.forceManyBody().strength(-80))
        .force("center", d3.forceCenter(widthPadrao / 2, heightRede / 2))
        .force("collide", d3.forceCollide(15));

    const svgRede = d3.create("svg")
        .attr("viewBox", [0, 0, widthPadrao, heightRede])
        .attr("style", "max-width: 100%; height: auto; border: 1px solid #eee; background: #fff; border-radius: 8px;");

    // Definição da Seta
    svgRede.append("defs").selectAll("marker")
        .data(["end"])
        .join("marker")
            .attr("id", "arrow")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 15)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
                .attr("fill", "#999")
                .attr("d", "M0,-5L10,0L0,5");

    const link = svgRede.append("g")
        .attr("stroke", "#999")
        .attr("stroke-opacity", 0.6)
        .selectAll("line")
        .data(links)
        .join("line")
            .attr("stroke-width", d => Math.sqrt(d.value) * 0.5)
            .attr("marker-end", "url(#arrow)");

    // Função de Arrastar (Drag)
    const drag = simulation => {
        function dragstarted(event) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }
        function dragged(event) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }
        function dragended(event) {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }
        return d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended);
    }

    const node = svgRede.append("g")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5)
        .selectAll("circle")
        .data(nodes)
        .join("circle")
            .attr("r", 6)
            .attr("fill", d => color(d.id))
            .style("cursor", "grab") // Cursor de mãozinha
            .call(drag(simulation));

    // Texto com borda branca para leitura fácil
    const text = svgRede.append("g")
        .selectAll("text")
        .data(nodes)
        .join("text")
            .text(d => d.id)
            .attr("x", 8)
            .attr("y", 3)
            .style("font-size", "10px")
            .style("font-family", "sans-serif")
            .style("pointer-events", "none") // Clique atravessa o texto
            .style("stroke", "white")
            .style("stroke-width", "3px")
            .style("paint-order", "stroke")
            .style("fill", "#333");

    node.append("title").text(d => d.id);

    simulation.on("tick", () => {
        // Limites (Parede invisível)
        node
            .attr("cx", d => d.x = Math.max(10, Math.min(widthPadrao - 10, d.x)))
            .attr("cy", d => d.y = Math.max(10, Math.min(heightRede - 10, d.y)));

        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        text
            .attr("x", d => d.x + 8)
            .attr("y", d => d.y + 3);
    });

    renderChart("vis-rede", svgRede.node());


    // =========================================================
    // 4. SCROLLAMA
    // =========================================================
    const steps = document.querySelectorAll(".step");
    const containers = document.querySelectorAll(".chart-container");

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const chartId = entry.target.getAttribute("data-chart");
                containers.forEach(c => c.classList.remove("active"));
                const alvo = document.getElementById(chartId);
                if (alvo) alvo.classList.add("active");
            }
        });
    }, { threshold: 0.5 });

    steps.forEach(step => observer.observe(step));
}

main().catch(err => console.error("Erro no script:", err));

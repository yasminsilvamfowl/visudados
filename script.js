async function main() { // <--- CORREÇÃO 1: Removida a duplicata aqui

    // =========================================================================
    // 1. CARREGAR DADOS REAIS
    // =========================================================================
    
    // Carrega seu CSV
    const rawData = await d3.csv("eurepoc_dyadic_dataset_0_1.csv");
    
    // Carrega seu Mapa Local (GeoJSON)
    const worldData = await d3.json("world.geojson");


    // =========================================================================
    // 2. LIMPEZA E TRATAMENTO
    // =========================================================================
    
    const ignorar = ["Not available", "Unknown", "Other"];

    const dadosConflitos = rawData.map(d => {
        let start = null;
        if (d.start_date && d.start_date.toLowerCase() !== "not available") {
            const cleanStr = d.start_date.replace(" ", "T");
            const date = new Date(cleanStr);
            if (!isNaN(date)) start = date;
        }

        const setoresRaw = d.receiver_subcategory || d.receiver_category || "";
        const setoresLimpos = setoresRaw.replace(/[\[\]'"]/g, "").split(/[;,]/)
            .map(s => s.trim())
            .filter(s => s && !ignorar.includes(s));
            
        const opsRaw = d.operation_type || "";
        const opsLimpos = opsRaw.replace(/[\[\]'"]/g, "").split(/[;,]/)
            .map(s => s.trim())
            .filter(s => s && !ignorar.includes(s));

        return {
            id: d.incident_id,
            data: start,
            ano: start ? start.getFullYear() : null,
            atacante: d.initiator_country || "Unknown",
            vitima: d.receiver_country || "Unknown",
            tipo_ator: (d.initiator_category || "").toLowerCase().includes("state") && 
                       !(d.initiator_category || "").includes("non-state") ? "Nation-State" : "Non-State / Hacker",
            setor: setoresLimpos[0] || "Unknown",
            tipos_lista: opsLimpos
        };
    }).filter(d => d.data !== null);


    // =========================================================================
    // 3. CRIAÇÃO DOS GRÁFICOS
    // =========================================================================

    const widthPadrao = 600; 

    // --- GRÁFICO 1: EVOLUÇÃO TEMPORAL ---
    const dadosPorAno = d3.rollup(dadosConflitos, v => v.length, d => d.ano);
    const timelineData = Array.from(dadosPorAno, ([ano, total]) => ({ano, total}))
        .sort((a, b) => a.ano - b.ano);

    const plotTemporal = Plot.plot({
        title: "Evolução dos Incidentes por Ano",
        width: widthPadrao,
        height: 400,
        x: { label: "Ano", tickFormat: "d", grid: true },
        y: { label: "Total de Ataques", grid: true },
        marks: [
            Plot.line(timelineData, {x: "ano", y: "total", stroke: "steelblue", strokeWidth: 3, curve: "monotone-x"}),
            Plot.areaY(timelineData, {x: "ano", y: "total", fill: "steelblue", fillOpacity: 0.1}),
            Plot.dot(timelineData, {x: "ano", y: "total", fill: "steelblue", tip: true})
        ]
    });
    
    renderChart("vis-temporal", plotTemporal);


    // --- GRÁFICO 2: MAPA DE VULNERABILIDADE ---
    
    // CORREÇÃO 2: Se o arquivo é GeoJSON, usamos direto!
    // Não usamos topojson.feature aqui.
    const countries = worldData; 
    
    const mapCounts = d3.rollup(dadosConflitos, v => v.length, d => {
        if (d.vitima === "United States") return "United States of America";
        if (d.vitima.includes("Russia")) return "Russian Federation"; 
        return d.vitima;
    });

    const plotMapa = Plot.plot({
        title: "Países Mais Atacados",
        width: widthPadrao,
        height: 450,
        projection: "equal-earth",
        color: { 
            scheme: "Reds", 
            type: "log", 
            label: "Nº de Ataques", 
            legend: true, 
            domain: [1, 500] 
        },
        marks: [
            Plot.sphere({fill: "#f0f4f8"}),
            Plot.geo(countries, {
                fill: d => mapCounts.get(d.properties.name),
                stroke: "white",
                strokeWidth: 0.5,
                title: d => `${d.properties.name}: ${mapCounts.get(d.properties.name) || 0} ataques`
            }),
            Plot.sphere({stroke: "#333", strokeWidth: 0.5})
        ]
    });

    renderChart("vis-mapa", plotMapa);


    // --- GRÁFICO 3: ARSENAL ---
    const contagemTipos = new Map();
    dadosConflitos.forEach(d => {
        d.tipos_lista.forEach(tipo => {
            contagemTipos.set(tipo, (contagemTipos.get(tipo) || 0) + 1);
        });
    });

    const dadosTipos = Array.from(contagemTipos, ([tipo, valor]) => ({tipo, valor}))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 10);

    const plotTipos = Plot.plot({
        title: "Top 10 Métodos de Ataque",
        width: widthPadrao,
        marginLeft: 200,
        x: { label: "Quantidade", grid: true },
        y: { label: null, domain: dadosTipos.map(d => d.tipo) },
        marks: [
            Plot.barX(dadosTipos, {x: "valor", y: "tipo", fill: "#663399", tip: true}),
            Plot.text(dadosTipos, {x: "valor", y: "tipo", text: "valor", dx: 5, textAnchor: "start"})
        ]
    });

    renderChart("vis-barras", plotTipos);


    // --- GRÁFICO 4: ORIGEM ---
    const origemCounts = d3.rollup(dadosConflitos, v => v.length, d => d.atacante);
    const dadosOrigem = Array.from(origemCounts, ([pais, valor]) => ({pais, valor}))
        .filter(d => d.pais !== "Unknown")
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 10);

    const plotOrigem = Plot.plot({
        title: "Principais Origens de Ataque",
        width: widthPadrao,
        marginLeft: 150,
        x: { label: "Ataques Iniciados", grid: true },
        y: { label: null, domain: dadosOrigem.map(d => d.pais) },
        marks: [
            Plot.barX(dadosOrigem, {x: "valor", y: "pais", fill: "tomato", tip: true}),
            Plot.text(dadosOrigem, {x: "valor", y: "pais", text: "valor", dx: 5, textAnchor: "start"})
        ]
    });

    renderChart("vis-origem", plotOrigem);

    // Inicia Scroll
    initScrollama();
}

// === FUNÇÕES AUXILIARES ===

function renderChart(id, plotElement) {
    const div = document.getElementById(id);
    if (div) {
        div.innerHTML = "";
        div.append(plotElement);
    } else {
        console.error(`Elemento com ID ${id} não encontrado no HTML.`);
    }
}

function initScrollama() {
    const steps = document.querySelectorAll('.step');
    const chartContainers = document.querySelectorAll('.chart-container');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const targetId = entry.target.getAttribute('data-chart');
                chartContainers.forEach(c => c.classList.remove('active'));
                const targetChart = document.getElementById(targetId);
                if (targetChart) {
                    targetChart.classList.add('active');
                }
            }
        });
    }, { threshold: 0.5 });
    steps.forEach(step => observer.observe(step));
}

main().catch(err => console.error("Erro ao carregar dados:", err));

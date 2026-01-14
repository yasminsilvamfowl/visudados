async function main() {

    // =========================================================================
    // 1. CARREGAMENTO DOS DADOS
    // =========================================================================
    
    // Tenta carregar o arquivo local. 
    // OBS: Você precisa estar rodando um servidor local (Live Server)
    const rawData = await d3.csv("eurepoc_dyadic_dataset_0_1.csv");
    
    // Para o mapa, vamos tentar carregar do CDN direto para facilitar sua vida,
    // mas se você tiver o arquivo "world.geojson" na pasta, troque a URL pelo nome do arquivo.
    const worldData = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"); 
    // OU: const worldData = await d3.json("world.geojson");


    // =========================================================================
    // 2. LIMPEZA E TRATAMENTO (Adaptado do seu código original)
    // =========================================================================
    
    const ignorar = ["Not available", "Unknown", "Other"];

    const dadosConflitos = rawData.map(d => {
        // Tratamento de Data
        let start = null;
        if (d.start_date && d.start_date.toLowerCase() !== "not available") {
            const cleanStr = d.start_date.replace(" ", "T");
            const date = new Date(cleanStr);
            if (!isNaN(date)) start = date;
        }

        // Tratamento de Setores/Categorias
        const setoresRaw = d.receiver_subcategory || d.receiver_category || "";
        const setoresLimpos = setoresRaw.replace(/[\[\]'"]/g, "").split(/[;,]/)
            .map(s => s.trim())
            .filter(s => s && !ignorar.includes(s));
            
        // Tratamento de Tipos de Operação
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
            // Lógica para definir se é Estado ou Hacker
            tipo_ator: (d.initiator_category || "").toLowerCase().includes("state") && 
                       !(d.initiator_category || "").includes("non-state") ? "Nation-State" : "Non-State / Hacker",
            setor: setoresLimpos[0] || "Unknown",
            tipos_lista: opsLimpos // Array com os tipos para contagem
        };
    }).filter(d => d.data !== null); // Remove dados sem data


    // =========================================================================
    // 3. CRIAÇÃO DOS GRÁFICOS
    // =========================================================================

    // Configuração padrão de largura para ficar bonito na coluna
    const widthPadrao = 600; 

    // --- GRÁFICO 1: EVOLUÇÃO TEMPORAL (ID: vis-temporal) ---
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


    // --- GRÁFICO 2: MAPA DE VULNERABILIDADE (ID: vis-mapa) ---
    const countries = topojson.feature(worldData, worldData.objects.countries);
    
    // Contagem por país vítima
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
            domain: [1, 500] // Ajuste conforme seus dados reais para o gradiente ficar bom
        },
        marks: [
            Plot.sphere({fill: "#f0f4f8"}), // Cor do oceano suave
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


    // --- GRÁFICO 3: ARSENAL / TIPOS DE ATAQUE (ID: vis-barras) ---
    // Precisamos "explodir" a lista de tipos (um incidente pode ter vários tipos)
    const contagemTipos = new Map();
    dadosConflitos.forEach(d => {
        d.tipos_lista.forEach(tipo => {
            contagemTipos.set(tipo, (contagemTipos.get(tipo) || 0) + 1);
        });
    });

    const dadosTipos = Array.from(contagemTipos, ([tipo, valor]) => ({tipo, valor}))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 10); // Top 10

    const plotTipos = Plot.plot({
        title: "Top 10 Métodos de Ataque",
        width: widthPadrao,
        marginLeft: 200, // Margem grande para ler os nomes
        x: { label: "Quantidade", grid: true },
        y: { label: null, domain: dadosTipos.map(d => d.tipo) },
        marks: [
            Plot.barX(dadosTipos, {x: "valor", y: "tipo", fill: "#663399", tip: true}),
            Plot.text(dadosTipos, {x: "valor", y: "tipo", text: "valor", dx: 5, textAnchor: "start"})
        ]
    });

    renderChart("vis-barras", plotTipos);


    // --- GRÁFICO 4: ORIGEM DOS ATAQUES (ID: vis-origem) ---
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


    // =========================================================================
    // 4. INICIA O SISTEMA DE SCROLL (SCROLLYTELLING)
    // =========================================================================
    initScrollama();
}

// Função Auxiliar para colocar o gráfico na tela
function renderChart(id, plotElement) {
    const div = document.getElementById(id);
    if (div) {
        div.innerHTML = ""; // Limpa qualquer coisa que tinha antes
        div.append(plotElement);
    } else {
        console.error(`Elemento com ID ${id} não encontrado no HTML.`);
    }
}

// Lógica de Detecção de Rolagem
function initScrollama() {
    const steps = document.querySelectorAll('.step');
    const chartContainers = document.querySelectorAll('.chart-container');

    // Configuração do Observador: dispara quando 50% do texto está visível
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // 1. Pega qual gráfico esse texto quer mostrar
                const targetId = entry.target.getAttribute('data-chart');
                
                // 2. Esconde todos
                chartContainers.forEach(c => c.classList.remove('active'));
                
                // 3. Mostra só o escolhido
                const targetChart = document.getElementById(targetId);
                if (targetChart) {
                    targetChart.classList.add('active');
                }
            }
        });
    }, { threshold: 0.5 }); // 0.5 significa "metade do elemento visível"

    // Manda observar todos os passos de texto
    steps.forEach(step => observer.observe(step));
}

// Roda a função principal
main().catch(err => console.error("Erro ao carregar dados:", err));

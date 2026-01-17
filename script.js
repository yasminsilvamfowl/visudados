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
    // GRÁFICO 1: MAPA DE VULNERABILIDADE (ATUALIZADO)
    // =========================================================
    
    // 1. AGREGAÇÃO AVANÇADA
    // Calculamos o total E o tipo de ataque mais comum por país
    const statsMapa = d3.rollup(dadosConflitos, v => {
        
        // Descobre qual o tipo de ataque mais comum (Moda)
        const contagemTipos = d3.rollup(v, d => d.length, d => {
             // Pega o primeiro item da lista de tipos (caso tenha mais de um)
             return d.tipos_lista[0] || "Unknown";
        });
        
        // Ordena do maior para o menor e pega o primeiro
        const ordenado = Array.from(contagemTipos).sort((a, b) => b[1] - a[1]);
        const tipoPrincipal = ordenado[0] ? ordenado[0][0] : "Vários";

        return {
            total: v.length,
            tipo: tipoPrincipal
        };
    }, 
    // Normalização dos nomes para bater com o TopoJSON
    d => {
        if (d.vitima === "United States") return "United States of America";
        if (d.vitima.includes("Russia")) return "Russian Federation";
        return d.vitima;
    });

    // 2. DESENHO DO GRÁFICO
    const plotMapa = Plot.plot({
        title: "Mapa de Vulnerabilidade",
        subtitle: `Total de incidentes: ${dadosConflitos.length}`,
        width: widthPadrao, // Usa a largura definida no seu script
        projection: "equal-earth",

        style: {
            fontSize: "10px", // <--- Mudei para 10px (o padrão é maior)
            backgroundColor: "transparent"
        },
        
        color: {
            scheme: "Reds",
            type: "symlog", // 'symlog' é melhor que 'log' pois lida bem com zeros
            label: "Quantidade de Ataques",
            legend: true,

            // 2. CONTROLA O TAMANHO DA BARRA
            width: 280,   // <--- Deixa a barra mais curta (horizontalmente)
            ticks: 3,     // <--- Mostra menos números na régua (limpa o visual)
        },

        marks: [
            // Fundo do mar/globo
            Plot.sphere({fill: "#f8f9fa", stroke: "#ccc"}),
            
            // Países
            Plot.geo(worldData, {
                fill: d => {
                    const s = statsMapa.get(d.properties.name);
                    return s ? s.total : 0;
                },
                stroke: "white",
                strokeWidth: 0.5,
                
                // Habilita o Tooltip interativo padrão do Plot
                tip: true,

                // Conteúdo do Tooltip Personalizado
                title: d => {
                    const s = statsMapa.get(d.properties.name);
                    if (!s) return `${d.properties.name}: Sem registros`;
                    
                    return `${d.properties.name}
-------------------------
Ataques Totais: ${s.total}
Principal Ameaça: ${s.tipo}`;
                }
            }),

            // Linhas de latitude/longitude
            Plot.graticule({strokeOpacity: 0.1})
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
    // GRÁFICO 6: A TEIA (Versão Final: Bolinhas Dinâmicas + Setas Corrigidas)
    // =========================================================
    
    // 1. PREPARAR DADOS (Contando ataques iniciados)
    const linksMap = d3.rollup(dadosConflitos, v => v.length, d => d.atacante, d => d.vitima);
    const links = [];
    const nodesSet = new Set();
    const ataquesFeitos = new Map(); // Para contar o peso

    for (const [source, targets] of linksMap) {
        for (const [target, value] of targets) {
            // Filtro: > 3 ataques e limpa Unknown
            if (value > 3 && source !== "Unknown" && target !== "Unknown" && source !== "Not attributed") {
                links.push({source, target, value});
                nodesSet.add(source);
                nodesSet.add(target);

                // Soma quantos ataques o país 'source' iniciou
                const atual = ataquesFeitos.get(source) || 0;
                ataquesFeitos.set(source, atual + value);
            }
        }
    }

    // Cria nós com a propriedade 'peso'
    const nodes = Array.from(nodesSet).map(id => ({
        id,
        peso: ataquesFeitos.get(id) || 0
    }));

    // 2. CONFIGURAÇÃO VISUAL
    const heightRede = 360; // Aumentei um pouco para caber melhor as bolas grandes
    const color = d3.scaleOrdinal(d3.schemeCategory10);

    // Escala de Tamanho (Raio da bolinha baseado no peso)
    const scaleRadius = d3.scaleSqrt()
        .domain([0, d3.max(nodes, d => d.peso)])
        .range([4, 20]); // De 5px até 30px

    // Simulação Física
    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(80)) // Distância maior
        .force("charge", d3.forceManyBody().strength(-120)) // Mais repulsão
        .force("center", d3.forceCenter(widthPadrao / 2, heightRede / 2))
        // Colisão considera o tamanho da bolinha
        .force("collide", d3.forceCollide(d => scaleRadius(d.peso) + 4));

    const svgRede = d3.create("svg")
        .attr("viewBox", [0, 0, widthPadrao, heightRede])
        .attr("style", "max-width: 90%; height: auto; display: block; margin: 0 auto; background: #fff; border-radius: 8px; border: 1px solid #eee;");

    // Definição da Seta
    svgRede.append("defs").selectAll("marker")
        .data(["end"])
        .join("marker")
            .attr("id", "arrow")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 0) // Vamos calcular isso via código (Math), então deixamos 0
            .attr("refY", 0)
            .attr("markerWidth", 5)
            .attr("markerHeight", 5)
            .attr("orient", "auto")
            .append("path")
                .attr("fill", "#999")
                .attr("d", "M0,-5L10,0L0,5");

    // Desenha as Linhas (Espessura Fixa)
    const link = svgRede.append("g")
        .attr("stroke", "#999")
        .attr("stroke-opacity", 0.5)
        .selectAll("line")
        .data(links)
        .join("line")
            .attr("stroke-width", 1) // Fixo e elegante
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

    // Desenha as Bolinhas (Tamanho Dinâmico)
    const node = svgRede.append("g")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .selectAll("circle")
        .data(nodes)
        .join("circle")
            .attr("r", d => scaleRadius(d.peso)) // <--- Tamanho aqui
            .attr("fill", d => color(d.id))
            .style("cursor", "grab")
            .call(drag(simulation));

    // Texto com borda (outline)
    const text = svgRede.append("g")
        .selectAll("text")
        .data(nodes)
        .join("text")
            .text(d => d.id)
            .attr("x", d => scaleRadius(d.peso) + 4) // Texto se afasta dependendo do tamanho da bola
            .attr("y", 3)
            .style("font-size", "10px")
            .style("font-family", "sans-serif")
            .style("pointer-events", "none")
            .style("stroke", "white")
            .style("stroke-width", "3px")
            .style("paint-order", "stroke")
            .style("fill", "#333");

    // Tooltip simples
    node.append("title").text(d => `${d.id}\nAtaques Iniciados: ${d.peso}`);

    // Loop de Animação (Tick)
    simulation.on("tick", () => {
        
        // 1. Paredes Invisíveis + Atualização de Nós
        node
            .attr("cx", d => {
                const r = scaleRadius(d.peso);
                return d.x = Math.max(r+5, Math.min(widthPadrao - r - 5, d.x));
            })
            .attr("cy", d => {
                const r = scaleRadius(d.peso);
                return d.y = Math.max(r + 5, Math.min(heightRede - r - 5, d.y));
            });

        // 2. Atualização das Linhas (Matemática da Seta na Borda)
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => {
                const r = scaleRadius(d.target.peso);
                // Calcula o ângulo entre os dois pontos
                const angle = Math.atan2(d.target.y - d.source.y, d.target.x - d.source.x);
                // Recua o ponto final baseado no raio do alvo + um espacinho (5px)
                return d.target.x - Math.cos(angle) * (r + 4); 
            })
            .attr("y2", d => {
                const r = scaleRadius(d.target.peso);
                const angle = Math.atan2(d.target.y - d.source.y, d.target.x - d.source.x);
                return d.target.y - Math.sin(angle) * (r + 4);
            });

        // 3. Atualização dos Textos
        text
            .attr("x", d => d.x + scaleRadius(d.peso) + 4)
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

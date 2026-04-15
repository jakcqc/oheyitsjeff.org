// particleStatsUI.js
// This module adds a dynamic UI panel to display stats for each particle group and individual particles within a Three.js ParticleSim.
// Usage: import { initStatsUI } from './particleStatsUI.js';
// After creating your ParticleSim instance, call: initStatsUI(particleSimInstance);

/**
 * Injects custom CSS styles for the stats UI and other UI components.
 */
function injectStyles() {
    const style = document.createElement('style');
    style.id = 'particle-stats-ui-styles';
    style.textContent = `
    #background {
        background-color: rgb(0, 0, 0);
    }
    * {
        font-family: 'Kosugi Maru','Scheherazade','Kumbh Sans','Courier Prime','Alata', sans-serif !important;
    }
    #stats-ui {
        background-color: none;
        color: rgb(255, 255, 255);
        font-size: 14px;
    }
    body {
        padding: 0px;
        margin: 0px;
        overflow: hidden;
    }
    #button-exit {
        bottom: 15px;
        background-color: black;
        position: absolute;
        left: 20px;
        border: 5px dashed rgb(255, 255, 255);
        height: auto;
        transition: .2s;
        font-weight: bold;
        color: white;
        padding: 8px;
        cursor: pointer;
    }
    #button-exit:hover {
        border-radius: 10px;
    }
    #button-config {
        color: white;
        background-color: black;
        position: absolute;
        right: 30px;
        padding: 5px;
        bottom: 15px;
        border: 3px dashed rgb(255, 255, 255);
        height: auto;
        transition: .2s;
        font-weight: bold;
        cursor: pointer;
    }
    #button-config:hover {
        border-radius: 10px;
    }
    .button-config_g {
        background-color: black;
        position: absolute;
        right: 30px;
        margin-top: 10px;
        padding: 5px;
        border: 3px dashed rgb(255, 255, 255);
        height: auto;
        transition: .2s;
        font-weight: bold;
        color: white;
        cursor: pointer;
    }
    .button-config_g:hover {
        border-radius: 10px;
    }
    #configParticle {
        position: absolute;
        right: 20px;
        background: rgba(184, 184, 184, 0.8);
        border: 3px solid rgb(233, 255, 182);
        padding: 10px;
        border-radius: 5px;
        z-index: 100;
        display: none;
        overflow-y: auto;
        scroll-behavior: smooth;
        max-height: 80%;
        max-width: 300px;
        transition: opacity 0.2s ease;
    }
    #configParticleSettings {
        position: absolute;
        margin-top: 20px;
        max-width: 1000px;
    }
    `;
    document.head.appendChild(style);
}

/**
 * Initializes the statistics UI for a given ParticleSim instance.
 * @param {ParticleSim} sim - The ParticleSim instance to visualize.
 */
export async function initStatsUI(sim) {
    // Inject styles once
    if (!document.getElementById('particle-stats-ui-styles')) {
        injectStyles();
    }

    // Create main container
    const container = document.createElement('div');
    container.id = 'stats-ui';
    Object.assign(container.style, {
        position: 'absolute',
        top: '10px',
        right: '10px',
        width: '300px',
        height: '400px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: '#fff',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        zIndex: '1000',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '8px',
        overflow: 'hidden'
    });

    // Tabs header
    const tabs = document.createElement('div');
    tabs.style.display = 'flex';
    tabs.style.borderBottom = '1px solid #555';
    container.appendChild(tabs);

    // Content area
    const content = document.createElement('div');
    content.style.flex = '1';
    content.style.overflowY = 'auto';
    content.style.padding = '8px';
    container.appendChild(content);

    document.body.appendChild(container);

    // For each group, create a tab and content pane
    sim.groups.forEach((group, gi) => {
        if(group.name != "STARTER"){return;}
        // Tab button
        const tabBtn = document.createElement('button');
        tabBtn.textContent = group.name;
        Object.assign(tabBtn.style, {
            flex: '1',
            padding: '6px',
            background: 'none',
            border: 'none',
            borderBottom: '2px solid transparent',
            cursor: 'pointer',
            color: 'inherit'
        });
        tabs.appendChild(tabBtn);

        // Content pane
        const pane = document.createElement('div');
        pane.style.display = 'none';

        // Group stats
        const title = document.createElement('h3');
        title.textContent = `Group: ${group.name}`;
        pane.appendChild(title);

        // Procedurally list all group properties
        Object.entries(group).forEach(([key, value]) => {
            if (['order', 'amount'].includes(key) || typeof value === 'number' || typeof value === 'string' || Array.isArray(value)) {
                const row = document.createElement('div');
                row.style.marginBottom = '4px';
                let displayVal = '';
                if (Array.isArray(value)) {
                    displayVal = JSON.stringify(value);
                } else {
                    displayVal = String(value);
                }
                row.textContent = `${key}: ${displayVal}`;
                pane.appendChild(row);
            }
        });

        // Particle list
        const particleList = document.createElement('div');
        particleList.style.marginTop = '10px';
        pane.appendChild(particleList);

        for (let i = 0; i < group.amount; i++) {
            const item = document.createElement('div');
            item.style.marginBottom = '4px';

            // Header button
            const pBtn = document.createElement('button');
            pBtn.textContent = `Particle ${i}`;
            Object.assign(pBtn.style, {
                width: '100%',
                textAlign: 'left',
                padding: '4px',
                background: '#222',
                border: '1px solid #444',
                cursor: 'pointer'
            });
            item.appendChild(pBtn);

            // Details div
            const details = document.createElement('div');
            details.style.display = 'none';
            details.style.paddingLeft = '8px';
            details.style.marginTop = '2px';

            // Get pos & vel slices
            const posArr = Array.from(sim.positions[gi].subarray(i*3, i*3 + 3));
            const velArr = Array.from(sim.velocities[gi].subarray(i*3, i*3 + 3));
            const posDiv = document.createElement('div');
            posDiv.textContent = `pos: [${posArr.join(', ')}]`;
            const velDiv = document.createElement('div');
            velDiv.textContent = `vel: [${velArr.join(', ')}]`;
            details.appendChild(posDiv);
            details.appendChild(velDiv);

            item.appendChild(details);
            particleList.appendChild(item);

            // Toggle on click
            pBtn.addEventListener('click', () => {
                details.style.display = details.style.display === 'none' ? 'block' : 'none';
            });
        }

        content.appendChild(pane);

        // Tab click behavior
        tabBtn.addEventListener('click', () => {
            // Deactivate all tabs & hide panes
            tabs.querySelectorAll('button').forEach(b => b.style.borderBottomColor = 'transparent');
            content.querySelectorAll(':scope > div').forEach(d => d.style.display = 'none');

            // Activate this one
            tabBtn.style.borderBottomColor = '#0af';
            pane.style.display = 'block';
        });

        // Activate first tab by default
        if (gi === 0) tabBtn.click();
    });
}

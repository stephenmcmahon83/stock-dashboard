document.addEventListener('DOMContentLoaded', () => {
    const tickerInput = document.getElementById('tickerInput');
    const fetchDataButton = document.getElementById('fetchDataButton');
    const stockDataTableBody = document.getElementById('stockDataTableBody');
    const messageDiv = document.getElementById('message');

    fetchDataButton.addEventListener('click', fetchData);
    
    // Initial fetch on page load for the default ticker
    fetchData();

    async function fetchData() {
        const ticker = tickerInput.value.trim().toUpperCase();
        if (!ticker) {
            displayMessage('Please enter a stock ticker.', 'error');
            return;
        }

        displayMessage(`Fetching all weekly data for ${ticker}...`, 'info');
        stockDataTableBody.innerHTML = ''; // Clear previous data

        // To get data "as far back as possible", we set period1 to 0 (start of Unix time)
        const period1 = 0; 
        // And period2 to now
        const period2 = Math.floor(Date.now() / 1000); 

        // The unofficial Yahoo Finance endpoint
        const yahooEndpoint = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1wk&events=history`;

        // We use the 'allorigins.win' proxy to get around CORS issues.
        // The final URL encodes the Yahoo endpoint to pass it to the proxy.
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yahooEndpoint)}`;

        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) {
                throw new Error(`Proxy server responded with status: ${response.status}`);
            }

            const data = await response.json();
            
            // The actual JSON from Yahoo is in the 'contents' property of the proxy's response
            const chartData = JSON.parse(data.contents);

            if (chartData.chart.error) {
                displayMessage(`Error from Yahoo Finance: ${chartData.chart.error.description}`, 'error');
                return;
            }

            const result = chartData.chart.result[0];
            const timestamps = result.timestamp;
            const quotes = result.indicators.quote[0];

            if (!timestamps || timestamps.length === 0) {
                displayMessage(`No weekly data found for ${ticker}.`, 'info');
                return;
            }

            displayMessage('', ''); // Clear message on success

            // The data is returned newest-first. We reverse it to show oldest-first.
            const rows = [];
            for (let i = 0; i < timestamps.length; i++) {
                // Skip entries where data might be null (can happen on some weeks)
                if (quotes.open[i] === null || quotes.close[i] === null) {
                    continue;
                }

                const date = new Date(timestamps[i] * 1000); // Yahoo timestamp is in seconds
                const dateString = date.toISOString().split('T')[0];
                const weekNumber = getSimpleWeekNumber(dateString);

                rows.push({
                    weekNumber: weekNumber,
                    date: dateString,
                    openPrice: quotes.open[i].toFixed(2),
                    closePrice: quotes.close[i].toFixed(2)
                });
            }

            // Display newest data first
            rows.reverse(); 

            rows.forEach(rowData => {
                const row = stockDataTableBody.insertRow();
                row.insertCell(0).textContent = rowData.weekNumber;
                row.insertCell(1).textContent = rowData.date;
                row.insertCell(2).textContent = `$${rowData.openPrice}`;
                row.insertCell(3).textContent = `$${rowData.closePrice}`;
            });

        } catch (error) {
            console.error('Error fetching or parsing data:', error);
            displayMessage('Failed to fetch data. The Yahoo API or proxy may be down. See console for details.', 'error');
        }
    }

    /**
     * Calculates a simple week number (1-52/53) for a given date string.
     * @param {string} dateString - The date in YYYY-MM-DD format.
     * @returns {number} The week number.
     */
    function getSimpleWeekNumber(dateString) {
        const date = new Date(dateString);
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        const currentUTC = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const diff = currentUTC - yearStart;
        const oneDay = 1000 * 60 * 60 * 24;
        const dayOfYear = Math.floor(diff / oneDay);
        return Math.ceil((dayOfYear + 1) / 7);
    }

    function displayMessage(msg, type) {
        messageDiv.textContent = msg;
        messageDiv.className = `message ${type}`;
    }
});

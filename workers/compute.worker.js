// 模擬重型運算
self.onmessage = (e) => {
    const { task, data } = e.data;
    if (task === 'fibonacci') {
        const result = fib(data);
        self.postMessage({ task, result });
    }
};

function fib(n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
}

// Runs the reverse-physics planner off the main thread. Several of these run
// the per-ball searches in parallel; one then does the joint solve.
importScripts("reverse.js");
onmessage = (e) => {
  const { job, kind, T, specs, opts, idxs } = e.data;
  let last = 0;
  const onProgress = (stage, frac) => {
    const now = Date.now();
    if (now - last > 100 || frac >= 1) { last = now; postMessage({ job, progress: { stage, frac } }); }
  };
  if (kind === "candidates") {
    postMessage({ job, result: Reverse.findCandidates(T, specs, idxs, { ...opts, onProgress }) });
  } else {
    postMessage({ job, result: Reverse.settle(Reverse.solve(T, specs, { ...opts, onProgress })) });
  }
};

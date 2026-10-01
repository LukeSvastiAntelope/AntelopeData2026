/**
 * Antelope social matplotlib style — larger type, brand palette, no chart junk.
 * Applied in Pyodide before re-running step code for a social card.
 */

export function buildAntelopeSocialStylePython(figsize: [number, number]): string {
  const [w, h] = figsize;
  return `
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib as mpl

# Antelope social style — clean, branded, format-matched figsize
mpl.rcParams.update({
    'figure.figsize': (${w}, ${h}),
    'figure.dpi': 160,
    'savefig.dpi': 200,
    'savefig.bbox': 'tight',
    'savefig.pad_inches': 0.15,
    'font.size': 14,
    'axes.titlesize': 18,
    'axes.labelsize': 14,
    'xtick.labelsize': 12,
    'ytick.labelsize': 12,
    'legend.fontsize': 12,
    'axes.spines.top': False,
    'axes.spines.right': False,
    'axes.grid': False,
    'axes.facecolor': '#ffffff',
    'figure.facecolor': '#ffffff',
    'text.color': '#1a1a1a',
    'axes.labelcolor': '#1a1a1a',
    'xtick.color': '#333333',
    'ytick.color': '#333333',
    'axes.prop_cycle': mpl.cycler(color=[
        '#0B3D2E', '#2F6F4E', '#C4A35A', '#4A7C9B', '#8B4513', '#5C6B73'
    ]),
})
plt.close('all')
`.trim();
}

/**
 * Capture the current matplotlib figure(s) as PNG data-URLs (dpi 200).
 */
export const CAPTURE_SOCIAL_PLOTS_PYTHON = `
import base64
from io import BytesIO
import matplotlib.pyplot as plt

_plots = []
if plt.get_fignums():
    for _fig_num in list(plt.get_fignums()):
        _fig = plt.figure(_fig_num)
        _buf = BytesIO()
        _fig.savefig(_buf, format='png', dpi=200, bbox_inches='tight', facecolor='white')
        _buf.seek(0)
        _img = base64.b64encode(_buf.getvalue()).decode()
        _plots.append(f"data:image/png;base64,{_img}")
        plt.close(_fig)
_plots
`.trim();

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

# Snapshot rcParams so we can restore after the social re-render
globals()['_antelope_rc_backup'] = {k: mpl.rcParams[k] for k in list(mpl.rcParams.keys())}

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

# Isolate session data: step code may do df = df[...] — never mutate the analysis df
if 'df' in globals() and df is not None:
    globals()['_antelope_df_orig'] = df
    df = df.copy(deep=True)
else:
    globals()['_antelope_df_orig'] = None
`.trim();
}

/**
 * After step code runs (which may set its own figsize), force every open
 * figure to the target social size and capture PNGs.
 */
export function buildForceSizeAndCapturePython(figsize: [number, number]): string {
  const [w, h] = figsize;
  return `
import base64
from io import BytesIO
import matplotlib.pyplot as plt
import matplotlib as mpl

_target_w, _target_h = ${w}, ${h}
_plots = []
if plt.get_fignums():
    for _fig_num in list(plt.get_fignums()):
        _fig = plt.figure(_fig_num)
        # Step code often sets an explicit figsize — override for the format
        _fig.set_size_inches(_target_w, _target_h, forward=True)
        try:
            _fig.tight_layout(pad=0.4)
        except Exception:
            pass
        _buf = BytesIO()
        _fig.savefig(
            _buf,
            format='png',
            dpi=200,
            bbox_inches='tight',
            facecolor=_fig.get_facecolor() or 'white',
        )
        _buf.seek(0)
        _img = base64.b64encode(_buf.getvalue()).decode()
        _plots.append(f"data:image/png;base64,{_img}")
        plt.close(_fig)
_plots
`.trim();
}

/** Restore analysis df + matplotlib defaults after a social re-render. */
export const RESET_SOCIAL_SESSION_PYTHON = `
import matplotlib as mpl
import matplotlib.pyplot as plt

plt.close('all')

# Restore the user's analysis dataframe (undo df = df[...] from step code)
_orig = globals().get('_antelope_df_orig', None)
if _orig is not None:
    df = _orig
globals().pop('_antelope_df_orig', None)

# Restore rcParams so later charts aren't stuck in social style
_backup = globals().get('_antelope_rc_backup', None)
if _backup is not None:
    try:
        mpl.rcParams.update(_backup)
    except Exception:
        mpl.rcdefaults()
    globals().pop('_antelope_rc_backup', None)
else:
    mpl.rcdefaults()
`.trim();

/**
 * @deprecated Use buildForceSizeAndCapturePython — kept for any stray imports.
 */
export const CAPTURE_SOCIAL_PLOTS_PYTHON = buildForceSizeAndCapturePython([8, 6]);

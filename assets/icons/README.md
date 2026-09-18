# The corner marks

The four icons the start screen shows in its bottom-right corner. They are used
as CSS masks rather than images, which is why every one of them is a single
colour with transparency doing all the work — `src/styles/arcade.css` paints the
link's own accent through them.

## Where they came from

These are [Icons8](https://icons8.com) icons, downloaded at 32px:

| File | Icons8 icon |
| --- | --- |
| `github.png` | GitHub |
| `bug.png` | Bug |
| `instagram.png` | Instagram |
| `fork.png` | Code Fork |

**Icons8's free tier requires a visible credit.** Their licence asks for a link
back to icons8.com somewhere the user can see it — on the page, in an about
box, or in the app's credits. Paying for a licence removes that requirement. The
game currently carries no such credit, so either add one or swap these for
something you own outright before treating the site as finished.

Nothing else in this repository is third-party: the dice, the cyberartifacts,
the bosses and every other icon are drawn in `src/data/icons.js` as text.

## What was changed

They are used as artwork, not redrawn, but each was processed into a mask:
transparency where there is no ink, opaque where there is.

Three of the four were already a single dark colour on transparency, so that
step only discarded the colour. `github.png` was not: it arrived as a white
Octocat sitting on a black disc, and masking that as-is produces a filled
circle with no cat in it. So for that one the *pale* pixels were kept and the
disc thrown away, which is the mark as GitHub themselves show it on a dark
background.

The originals are unmodified in whatever folder you downloaded them to; these
are derived copies.

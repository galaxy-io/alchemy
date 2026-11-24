package interactive

import (
	"errors"
	"time"

	"github.com/atterpac/dado/inline"
)

const spinnerInterval = 80 * time.Millisecond

// loading keeps a one-line spinner in the live frame while fn runs.
func (r *Renderer) loading(label string, fn func() error) error {
	done := make(chan error, 1)
	go func() { done <- fn() }()
	ticker := time.NewTicker(spinnerInterval)
	defer ticker.Stop()
	width := renderWidth(r.out)
	frames := r.theme.Status.SpinnerFrames
	if len(frames) == 0 {
		frames = []string{"·"}
	}
	for tick := 0; ; tick++ {
		frame := inline.NewFrame(width, 1)
		x := draw(frame, 0, 0, frames[tick%len(frames)], r.theme.Accent)
		draw(frame, x+1, 0, label, r.theme.Muted)
		if err := r.live.Render(frame); err != nil {
			return errors.Join(err, <-done)
		}
		select {
		case err := <-done:
			if err != nil {
				return errors.Join(err, r.live.Clear())
			}
			return nil
		case <-ticker.C:
		}
	}
}

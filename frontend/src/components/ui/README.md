# PayPost Small Design System (`src/components/ui`)

Hand-written, lightweight, zero-dependency design system built on Tailwind CSS.
Strictly adheres to:
- 44px minimum touch targets (`min-h-11`)
- 16px minimum text inputs for mobile zoom prevention
- Mobile-first responsive layouts
- WCAG AA contrast, `focus-visible` outlines, and text+color state representations

---

### Components & Props

#### 1. `Button`
- **Props**: `children`, `type` (default `'button'`), `variant` (`'primary' | 'secondary' | 'danger' | 'ghost'`), `fullWidth` (`boolean`), `loading` (`boolean`), `disabled` (`boolean`), `onClick`, `className`
- **Features**: Built-in SVG spinner during `loading`, disables interaction while preserving layout.

#### 2. `Card`
- **Props**: `children`, `className`, `...props`
- **Features**: Clean rounded corners (`rounded-xl`), soft border (`border-gray-200`), mobile-friendly padding (`p-4 sm:p-6`).

#### 3. `Badge`
- **Props**: `children`, `variant` (`'neutral' | 'success' | 'warning' | 'danger' | 'info'`), `className`
- **Features**: Semantic status pill with subtle border and high text contrast.

#### 4. `Input`, `Select`, `Textarea`
- **Props**: `id`, `label`, `error`, `hint`, `required`, `disabled`, `inputMode`, `autoComplete`, `enterKeyHint`, `value`, `onChange`, `className`
- **Features**: Auto-linked label via `htmlFor`, 16px font-size to avoid iOS zoom, accessible `role="alert"` for errors.

#### 5. `Tabs`
- **Props**: `tabs` (array of `{ id, label, count? }`), `defaultTab`, `paramName` (default `'tab'`), `className`
- **Features**: Sideways scrolling with smooth scroll on mobile, state synchronized with URL search params (`?tab=`).

#### 6. `Modal` (Bottom Sheet on Mobile)
- **Props**: `isOpen`, `onClose`, `title`, `children`, `maxWidth`, `className`
- **Features**: Below `sm` breakpoint: full-width bottom sheet (`rounded-t-2xl`, `max-h-[90dvh]`). Above `sm`: centered modal. Locks body scroll, traps Escape key, manages focus.

#### 7. `Menu`
- **Props**: `items` (array of `{ label, onClick, icon?, danger?, disabled?, hidden? }`), `label`, `trigger`
- **Features**: Touch-friendly 44px kebab dropdown with Escape and outside-click dismissal.

#### 8. `ToastProvider` & `useToast`
- **Methods**: `toast.success(message)`, `toast.error(message)`, `toast.info(message)`
- **Features**: 4-second auto-dismiss, Polite `aria-live`, stacked safely above the mobile bottom tab bar.

#### 9. `Skeleton`
- **Props**: `variant` (`'card' | 'list' | 'stat'`), `count` (default 1), `className`
- **Features**: Smooth animated pulse shimmer replacing full-page spinners.

#### 10. `PageHeader`
- **Props**: `title`, `subtitle`, `actions`, `className`
- **Features**: Flexible header wrapping action buttons nicely on small screens.

#### 11. `StatCard`
- **Props**: `label`, `value`, `subtext`, `icon`, `className`
- **Features**: Card for metric presentation with `tabular-nums` for financial numbers.

#### 12. `Icon`
- **Props**: `name`, `className`, `'aria-hidden'`
- **Features**: Hand-written inline SVGs (home, wallet, bell, more, settings, close, search, copy, etc.).

#### 13. `CountdownChip`
- **Props**: `isoString`, `prefix`, `className`
- **Features**: Urgency pill (`overdue`, `urgent`, `soon`, `ok`) that auto-updates every 60 seconds with full IST timestamp tooltip.

#### 14. `ResponsiveList`
- **Props**: `items`, `renderCard`, `renderRow`, `headers`, `emptyText`, `className`
- **Features**: Fetches data once, renders cards on mobile (< md) and a responsive data table on desktop (>= md).

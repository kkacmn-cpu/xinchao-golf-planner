(() => {
  const dataNode = document.getElementById('golf-data');
  const data = dataNode ? JSON.parse(dataNode.textContent) : { courses: [] };
  const $ = (selector) => document.querySelector(selector);
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const menuButton = $('.menu-toggle');
  const mobileMenu = $('#mobile-menu');
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!open));
    if (mobileMenu) mobileMenu.hidden = open;
  });
  mobileMenu?.addEventListener('click', () => { mobileMenu.hidden = true; menuButton?.setAttribute('aria-expanded', 'false'); });

  const plannerForm = $('#planner-form');
  if (!plannerForm) return;

  const region = $('#planner-region');
  const arrival = $('#planner-arrival');
  const departure = $('#planner-departure');
  const rounds = $('#planner-rounds');
  const players = $('#planner-players');
  const error = $('#planner-error');
  let plan = { dates: [], requested: 0, assignments: {} };
  let selectedDate = null;
  const roundDates = () => plan.dates.slice(1, -1);
  const assignedCount = () => roundDates().filter((dateValue) => plan.assignments[dateValue]).length;
  const toLocalDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const arrivalDefault = new Date();
  arrivalDefault.setDate(arrivalDefault.getDate() + 21);
  const departureDefault = new Date(arrivalDefault);
  departureDefault.setDate(departureDefault.getDate() + 3);
  arrival.value = toLocalDate(arrivalDefault);
  departure.value = toLocalDate(departureDefault);
  arrival.min = toLocalDate(new Date());
  departure.min = arrival.value;

  function calendarDays(start, end) {
    const days = [];
    // Date-only input is a calendar day, not a local instant. UTC arithmetic
    // keeps the displayed day unchanged in Vietnam, Korea, and DST timezones.
    for (let cursor = Date.parse(`${start}T00:00:00Z`), last = Date.parse(`${end}T00:00:00Z`); cursor <= last; cursor += 86400000) {
      days.push(new Date(cursor).toISOString().slice(0, 10));
    }
    return days;
  }
  function save() {
    localStorage.setItem('xg-planner-v2', JSON.stringify({ region: region.value, arrival: arrival.value, departure: departure.value, rounds: rounds.value, players: players.value, assignments: plan.assignments }));
  }
  function renderOptions() {
    const target = $('#planner-course-options');
    const regionId = region.value;
    if (!regionId) { target.innerHTML = '<p class="empty-state">먼저 주요 지역을 선택하세요.</p>'; return; }
    const assigned = new Set(Object.values(plan.assignments));
    const courses = data.courses.filter((item) => item.region_id === regionId).slice(0, 12);
    target.innerHTML = courses.map((item) => `<button type="button" class="course-option" data-add-course="${esc(item.course_id)}" ${assigned.has(item.course_id) ? 'disabled' : ''}><strong>${esc(item.name_ko)}</strong><span>${esc(item.official_name)}</span></button>`).join('') || '<p class="empty-state">이 지역의 등록 골프장이 없습니다.</p>';
  }
  function renderTimeline() {
    const target = $('#planner-timeline');
    if (!plan.dates.length) { target.innerHTML = '<li class="timeline-empty">도착일·출국일·라운드 수를 입력하면 날짜별 슬롯을 만듭니다.</li>'; return; }
    target.innerHTML = plan.dates.map((dateValue, index) => {
      if (index === 0) return `<li class="fixed" data-day="${index + 1}"><strong>도착 · 숙소 체크인</strong><span>${dateValue} · 항공과 차량 이동일</span></li>`;
      if (index === plan.dates.length - 1) return `<li class="fixed" data-day="${index + 1}"><strong>체크아웃 · 공항 이동</strong><span>${dateValue} · 출국 보호일</span></li>`;
      const course = data.courses.find((item) => item.course_id === plan.assignments[dateValue]);
      if (!course) return `<li class="open${selectedDate === dateValue ? ' selected' : ''}" data-day="${index + 1}"><strong>휴식·라운드 선택 가능</strong><span>${dateValue} · ${selectedDate === dateValue ? '선택한 날짜 · 코스를 고르세요' : '라운드가 없으면 휴식일'}</span><button type="button" class="day-select" data-select-date="${dateValue}" aria-pressed="${selectedDate === dateValue}">${selectedDate === dateValue ? '날짜 선택됨' : '라운드 날짜로 선택'}</button></li>`;
      return `<li data-day="${index + 1}"><strong>${esc(course.name_ko)}</strong><span>${dateValue} · ${esc(course.region_ko)} · 왕복 차량 확인</span><button type="button" data-remove-date="${dateValue}" aria-label="${esc(course.name_ko)} 일정에서 제거">×</button></li>`;
    }).join('');
    const count = assignedCount();
    $('#planner-count').textContent = `배치 ${count} / 요청 ${plan.requested}`;
    $('#planner-title').textContent = `${players.value}인 ${plan.dates.length - 1}박 ${plan.dates.length}일 · ${plan.requested}회`;
    $('#planner-course-status').textContent = selectedDate ? `${selectedDate}에 배치할 코스를 고르세요. 라운드가 없는 날짜는 휴식일로 남습니다.` : '일정판에서 라운드 날짜를 먼저 선택하세요.';
    renderOptions();
  }
  function buildPlan(persist = true) {
    error.hidden = true;
    if (!region.value) { error.textContent = '주요 지역을 선택하세요.'; error.hidden = false; return false; }
    if (!arrival.value || !departure.value || departure.value <= arrival.value) { error.textContent = '출국일은 도착일보다 늦어야 합니다.'; error.hidden = false; return false; }
    const dates = calendarDays(arrival.value, departure.value);
    const requested = Number(rounds.value);
    const available = Math.max(0, dates.length - 2);
    if (requested > available) { error.textContent = `이 일정에는 골프를 최대 ${available}회만 배치할 수 있습니다. 날짜를 늘리거나 희망 라운드를 줄이세요.`; error.hidden = false; return false; }
    plan = { dates, requested, assignments: {} };
    selectedDate = roundDates()[0] || null;
    renderTimeline();
    if (persist) save();
    return true;
  }
  plannerForm.addEventListener('submit', (event) => { event.preventDefault(); buildPlan(); });
  region.addEventListener('change', () => {
    if (!plan.dates.length) { renderOptions(); return; }
    plan.assignments = {};
    selectedDate = roundDates()[0] || null;
    renderTimeline();
    save();
  });
  arrival.addEventListener('change', () => { departure.min = arrival.value; });
  document.addEventListener('click', (event) => {
    const select = event.target.closest('[data-select-date]');
    const add = event.target.closest('[data-add-course]');
    const remove = event.target.closest('[data-remove-date]');
    if (select) {
      const dateValue = select.dataset.selectDate;
      if (!roundDates().includes(dateValue) || plan.assignments[dateValue]) return;
      selectedDate = dateValue;
      error.hidden = true;
      renderTimeline();
    }
    if (add) {
      if (!selectedDate || !roundDates().includes(selectedDate) || plan.assignments[selectedDate]) { error.textContent = '일정판에서 빈 라운드 날짜를 먼저 선택하세요.'; error.hidden = false; return; }
      if (assignedCount() >= plan.requested) { error.textContent = '요청한 라운드 수가 모두 채워졌습니다. 기존 코스를 제거한 뒤 추가하세요.'; error.hidden = false; return; }
      const course = data.courses.find((item) => item.course_id === add.dataset.addCourse && item.region_id === region.value);
      if (!course || Object.values(plan.assignments).includes(course.course_id)) { error.textContent = '선택한 지역의 다른 골프장을 선택하세요.'; error.hidden = false; return; }
      plan.assignments[selectedDate] = course.course_id;
      selectedDate = roundDates().find((dateValue) => !plan.assignments[dateValue]) || null;
      error.hidden = true;
      renderTimeline();
      save();
    }
    if (remove) {
      const dateValue = remove.dataset.removeDate;
      if (!roundDates().includes(dateValue)) return;
      delete plan.assignments[dateValue];
      selectedDate = dateValue;
      renderTimeline();
      save();
    }
  });
  $('#planner-reset')?.addEventListener('click', () => {
    localStorage.removeItem('xg-planner-v2');
    plan = { dates: [], requested: 0, assignments: {} };
    selectedDate = null;
    renderTimeline();
    renderOptions();
    $('#planner-title').textContent = '날짜를 선택하세요';
    $('#planner-count').textContent = '배치 0 / 요청 0';
    $('#planner-course-status').textContent = '일정판에서 라운드 날짜를 먼저 선택하세요.';
  });
  try {
    const saved = JSON.parse(localStorage.getItem('xg-planner-v2') || 'null');
    if (saved && typeof saved === 'object') {
      region.value = saved.region || '';
      arrival.value = saved.arrival || arrival.value;
      departure.value = saved.departure || departure.value;
      rounds.value = saved.rounds || rounds.value;
      players.value = saved.players || players.value;
      if (buildPlan(false)) {
        const allowedDates = new Set(roundDates());
        const seenCourses = new Set();
        for (const [dateValue, courseId] of Object.entries(saved.assignments || {})) {
          if (allowedDates.has(dateValue) && assignedCount() < plan.requested && !seenCourses.has(courseId) && data.courses.some((course) => course.course_id === courseId && course.region_id === region.value)) {
            plan.assignments[dateValue] = courseId;
            seenCourses.add(courseId);
          }
        }
        selectedDate = roundDates().find((dateValue) => !plan.assignments[dateValue]) || null;
        renderTimeline();
        save();
      }
    } else renderOptions();
  } catch {
    localStorage.removeItem('xg-planner-v2');
    renderOptions();
  }
})();

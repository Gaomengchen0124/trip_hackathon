const openingQuestion = `<section class="slide opening-question active" data-title="如果能走进最喜欢的故事" data-page="01" data-chapter="0" data-pose="welcome" data-guide="先想起那个让你心动的故事，再和 YOYO 一起出发。" aria-labelledby="opening-question-title">
  <div class="question-intro">
    <p class="question-kicker"><span>PROLOGUE</span><i></i>故事的序章</p>
    <h1 id="opening-question-title" class="question-copy"><span class="question-first">如果有一天，</span><span class="question-middle">你能走进自己<span>最喜欢的故事，</span></span><em>你会去哪里？</em></h1>
    <div class="question-invitation"><p>让 YOYO 带你，翻开下一章。</p><button class="question-enter" data-next aria-label="走进故事，进入第二页"><span>走进故事</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7"/></svg></button></div>
  </div>
  <div class="question-scene" role="img" aria-label="双鳍海豚 YOYO 在发光的故事之门前迎接你，身后展开《哈利·波特》与《繁花》的故事画面">
    <div class="opening-halo" aria-hidden="true"></div>
    <div class="opening-door" aria-hidden="true"><img src="@@portal@@" alt=""><span>THE STORY BEGINS</span></div>
    <svg class="opening-route" viewBox="0 0 650 580" fill="none" aria-hidden="true"><ellipse cx="331" cy="340" rx="296" ry="170" transform="rotate(-22 331 340)"/><path class="opening-route-trail" d="M43 446C101 523 203 491 218 441S142 335 236 309 413 423 515 345 612 199 578 123"/><circle cx="43" cy="446" r="6"/><circle cx="578" cy="123" r="6"/></svg>
    <figure class="story-window magic-window" aria-hidden="true"><img src="@@london@@" alt=""><figcaption><small>A LITTLE MAGIC</small><span>魔法世界的入口</span></figcaption></figure>
    <figure class="story-window city-window" aria-hidden="true"><img src="@@shanghai@@" alt=""><figcaption><small>A CITY OF STORIES</small><span>流光溢彩的上海</span></figcaption></figure>
    <span class="opening-spark spark-one" aria-hidden="true">✦</span><span class="opening-spark spark-two" aria-hidden="true">✧</span><span class="opening-spark spark-three" aria-hidden="true">✦</span>
    <div class="opening-mascot" aria-hidden="true"><span class="opening-greeting">和我一起出发吧！</span><span class="yoyo opening-yoyo"></span></div>
    <span class="opening-ground" aria-hidden="true"></span>
    <p class="opening-scene-caption" aria-hidden="true"><span>STORY</span><i>······</i><span>YOU</span><i>······</i><span>SOMEWHERE</span></p>
  </div>
  <button class="opening-motion" id="openingMotion" type="button" aria-pressed="false"><svg viewBox="0 0 16 16" aria-hidden="true"><path class="motion-pause" d="M5 3v10M11 3v10"/><path class="motion-play" d="m5 3 7 5-7 5Z"/></svg><span>暂停动效</span></button>
</section>`;

export function applyStoryFlow(html, originalNotes) {
  const slides = [...html.matchAll(/<section class="slide\b[\s\S]*?<\/section>/g)].map(match => match[0]);
  if (slides.length !== 10 || originalNotes.length !== 10) throw new Error('Story flow expects the ten source slides and notes.');
  const firstSlideOffset = html.indexOf(slides[0]);
  // New question → cover → product → opportunity → planning → decisions → iteration → co-creation → demo → close.
  const order = [null, 0, 1, 2, 3, 5, 6, 7, 4, 8, 9];
  const chapters = [0, 0, 1, 1, 2, 3, 3, 3, 4, 5, 6];
  const reordered = order.map((sourceIndex, index) => {
    let slide = sourceIndex === null ? openingQuestion : slides[sourceIndex];
    if (sourceIndex === 0) slide = slide.replace(/<p class="cover-question\b[^>]*>[\s\S]*?<\/p>/, '');
    if (sourceIndex === 4) {
      slide = slide.replace('从发现喜欢的故事，到安排想去的地点。<br><em>接下来，还有一道真正的难题：取舍。</em>', '每一次出发，都会留下新的期待。<br><em>现在，进入真实网站，走一遍完整旅程。</em>');
      slide = slide.replace('用户的期待，也是下一条路线的起点', '让旅程中的期待，成为下一条路线的起点');
    }
    if (sourceIndex === 8) slide = slide.replace('返回后接续第 10 页', '返回后接续第 11 页');
    return slide.replace(/<section\b[^>]*>/, tag => {
      let next = tag.replace(/data-page="\d+"/, `data-page="${String(index + 1).padStart(2, '0')}"`).replace(/data-chapter="\d+"/, `data-chapter="${chapters[index]}"`);
      next = next.replace(/\s+inert\b/g, '').replace(/class="([^"]*)"/, (_, classes) => `class="${classes.split(/\s+/).filter(c => c !== 'active').join(' ')}${index === 0 ? ' active' : ''}"`);
      if (index !== 0) next = next.replace(/>$/, ' inert>');
      return next;
    });
  });
  html = html.replace(/<section class="slide\b[\s\S]*?<\/section>/g, '');
  html = html.slice(0, firstSlideOffset) + reordered.join('\n\n') + html.slice(firstSlideOffset);
  html = html.replace(/<nav class="chapter-nav"[\s\S]*?<\/nav>/, `<nav class="chapter-nav" aria-label="叙事章节"><button data-goto="1" class="current">入故事</button><button data-goto="3">见需求</button><button data-goto="5">学规划</button><button data-goto="6">做选择</button><button data-goto="9">续故事</button><button data-goto="10">去体验</button><button data-goto="11">共远行</button></nav>`);
  html = html.replace('01 / 10', '01 / 11').replace('路演手札 · 十页故事', '路演手札 · 十一页故事').replace("' / 10 · STORY PILGRIM'", "' / 11 · STORY PILGRIM'");
  html = html.replace('第三页 · 数据手札', '第四页 · 数据手札');
  html = html.replace("classList.toggle('dark-chapter', [3, 4, 5, 8].includes(current))", "classList.toggle('dark-chapter', slides[current].matches('.hybrid, .co-create, .dilemma, .demo')); $('stage').classList.toggle('is-opening-question', slides[current].classList.contains('opening-question'))");
  html = html.replace('const demo=slides[8]', "const demo=document.querySelector('.slide.demo')");
  html = html.replace("$('finishDemo').addEventListener('click',()=>showSlide(9))", "$('finishDemo').addEventListener('click',()=>showSlide(slides.indexOf(document.querySelector('.slide.closing'))))");
  const notes = order.map(sourceIndex => sourceIndex === null ? {
    part: 'pt1 · 开场提问',
    text: '如果有一天，你能走进自己最喜欢的故事，你会去哪里？',
    cue: '随文字逐句出现，缓缓提出问题。看到 YOYO 和两幅故事画面后，停顿两到三秒，让观众想到自己的故事。点击“走进故事”或按右方向键，接入作品封面。右下角可暂停背景动效。'
  } : structuredClone(originalNotes[sourceIndex]));
  notes[1].part = 'pt1 · 作品登场';
  notes[1].text = notes[1].text.replace(/^如果有一天[\s\S]*?\n\n/, '');
  notes[1].cue = '承接上一页的问题，从《哈利·波特》和《繁花》给出具象的远方，再介绍 Story Pilgrim。此页不重复开场问题。';
  notes[3].cue = notes[3].cue.replace('第三页', '第四页');
  notes[4].text += '\n\n不过，当想去的地方超出假期，一道取舍题就会出现。';
  notes[4].cue = '说明算法与 AI 如何协作，再用“想去的地方超出假期”引出下一页取舍情境。';
  notes[6].cue = notes[6].cue.replace('第 9 页网站', '第 10 页网站');
  notes[7].text += '\n\n而一次行程之外，用户还会有更多故事想要抵达。这些期待，也可以成为下一条路线的起点。';
  notes[7].cue = '先收束动态调整和用户选择权，再从“一次行程之外的期待”自然进入推荐与内容共建。';
  notes[8].text = '当一份行程可以持续调整，更多用户的期待，也值得被接住。\n\n我们设计了个性化推荐机制，并搭建运营管理后台，支持路线审核、发布迭代。\n\n用户也可以通过路线许愿和意见反馈参与内容共建，形成用户需求反馈与平台内容迭代的双向闭环。\n\n从一次旅行的反馈，到下一条路线的诞生，我们希望内容可以持续生长。现在，我们进入真实网站，走一遍刚才的完整旅程。';
  notes[8].cue = '这是原第 5 页，现位于动态调整之后。沿四个环节说明内容闭环，最后直接邀请观众进入下一页现场演示，不再引出已经讲过的取舍问题。';
  notes[9].cue = notes[9].cue.replace('第 10 页', '第 11 页');
  return { html, notes, order };
}

-- Reviewed atlas-system classification checks for organ-level structures.
-- This script is intentionally not run automatically. Review and execute it
-- manually in the Supabase SQL Editor if these questions suit your quiz.
-- Existing heart, lungs, and liver seeds are excluded.
-- correct_option is zero-based, matching supabase/schema.sql.

begin;

with systems(labels) as (
  values (array[
    'Cardiovascular',
    'Digestive',
    'Endocrine',
    'Lymphatic',
    'Muscular',
    'Nervous',
    'Reproductive',
    'Respiratory',
    'Skeletal',
    'Urinary'
  ]::text[])
), organs(organ_id, organ_name, system_name) as (
  values
    ('cardiac-internal-structures', 'Cardiac Internal Structures', 'Cardiovascular'),
    ('pulmonary-arteries', 'Pulmonary Arteries', 'Cardiovascular'),
    ('pulmonary-veins', 'Pulmonary Veins', 'Cardiovascular'),
    ('gallbladder', 'Gallbladder', 'Digestive'),
    ('large-intestine', 'Large Intestine', 'Digestive'),
    ('oesophagus', 'Oesophagus', 'Digestive'),
    ('pancreas', 'Pancreas', 'Digestive'),
    ('small-intestine', 'Small Intestine', 'Digestive'),
    ('stomach', 'Stomach', 'Digestive'),
    ('adrenal-glands', 'Adrenal Glands', 'Endocrine'),
    ('parathyroid-glands', 'Parathyroid Glands', 'Endocrine'),
    ('pineal-gland', 'Pineal Gland', 'Endocrine'),
    ('pituitary-gland', 'Pituitary Gland', 'Endocrine'),
    ('thyroid-gland', 'Thyroid Gland', 'Endocrine'),
    ('lymphoid-organs', 'Lymphoid Organs', 'Lymphatic'),
    ('spleen', 'Spleen', 'Lymphatic'),
    ('deep-gluteal-muscles', 'Deep Gluteal Muscles', 'Muscular'),
    ('deltoid-muscles', 'Deltoid Muscles', 'Muscular'),
    ('external-abdominal-obliques', 'External Abdominal Obliques', 'Muscular'),
    ('facial-expression-muscles', 'Facial Expression Muscles', 'Muscular'),
    ('hand-muscles', 'Hand Muscles', 'Muscular'),
    ('inguinal-ligaments', 'Inguinal Ligaments', 'Muscular'),
    ('internal-abdominal-obliques', 'Internal Abdominal Obliques', 'Muscular'),
    ('linea-alba', 'Linea Alba', 'Muscular'),
    ('neck-muscles', 'Neck Muscles', 'Muscular'),
    ('pyramidalis-muscles', 'Pyramidalis Muscles', 'Muscular'),
    ('quadratus-lumborum', 'Quadratus Lumborum', 'Muscular'),
    ('rectus-abdominis', 'Rectus Abdominis', 'Muscular'),
    ('rotator-cuff-muscles', 'Rotator Cuff Muscles', 'Muscular'),
    ('superficial-gluteal-muscles', 'Superficial Gluteal Muscles', 'Muscular'),
    ('transversus-abdominis', 'Transversus Abdominis', 'Muscular'),
    ('abducens-nuclei', 'Abducens Nuclei', 'Nervous'),
    ('brainstem', 'Brainstem', 'Nervous'),
    ('cerebellum', 'Cerebellum', 'Nervous'),
    ('cerebral-aqueduct', 'Cerebral Aqueduct', 'Nervous'),
    ('cerebrum', 'Cerebrum', 'Nervous'),
    ('facial-motor-nuclei', 'Facial Motor Nuclei', 'Nervous'),
    ('fourth-ventricle', 'Fourth Ventricle', 'Nervous'),
    ('inferior-colliculi', 'Inferior Colliculi', 'Nervous'),
    ('interpeduncular-fossae', 'Interpeduncular Fossae', 'Nervous'),
    ('medullary-olives', 'Medullary Olives', 'Nervous'),
    ('medullary-pyramids', 'Medullary Pyramids', 'Nervous'),
    ('oculomotor-nuclei', 'Oculomotor Nuclei', 'Nervous'),
    ('red-nuclei', 'Red Nuclei', 'Nervous'),
    ('superior-colliculi', 'Superior Colliculi', 'Nervous'),
    ('superior-salivatory-nuclei', 'Superior Salivatory Nuclei', 'Nervous'),
    ('vestibular-nuclei', 'Vestibular Nuclei', 'Nervous'),
    ('ductus-deferentes', 'Ductus Deferentes', 'Reproductive'),
    ('ejaculatory-ducts', 'Ejaculatory Ducts', 'Reproductive'),
    ('epididymides', 'Epididymides', 'Reproductive'),
    ('penile-erectile-tissues', 'Penile Erectile Tissues', 'Reproductive'),
    ('prostate', 'Prostate', 'Reproductive'),
    ('seminal-glands', 'Seminal Glands', 'Reproductive'),
    ('testes', 'Testes', 'Reproductive'),
    ('trachea', 'Trachea', 'Respiratory'),
    ('appendicular-skeleton', 'Appendicular Skeleton', 'Skeletal'),
    ('skeleton', 'Skeleton', 'Skeletal'),
    ('bladder', 'Bladder', 'Urinary'),
    ('kidneys', 'Kidneys', 'Urinary')
), numbered as (
  select
    organs.*,
    row_number() over (order by organ_id)::integer as question_number,
    array_remove(systems.labels, organs.system_name) as distractors
  from organs
  cross join systems
), option_sets as (
  select
    numbered.*,
    array[
      system_name,
      distractors[(question_number % 9) + 1],
      distractors[((question_number + 3) % 9) + 1],
      distractors[((question_number + 6) % 9) + 1]
    ]::text[] as base_options,
    (question_number % 4)::integer as rotation
  from numbered
), questions as (
  select
    organ_id,
    format('Which anatomical system is %s part of?', organ_name) as question,
    to_jsonb(array[
      base_options[((rotation + 0) % 4) + 1],
      base_options[((rotation + 1) % 4) + 1],
      base_options[((rotation + 2) % 4) + 1],
      base_options[((rotation + 3) % 4) + 1]
    ]) as options,
    ((4 - rotation) % 4)::smallint as correct_option,
    format(
      'The atlas maps %s to the %s system.',
      organ_name,
      system_name
    ) as explanation
  from option_sets
)
insert into public.quiz_questions
  (organ_id, question, options, correct_option, explanation)
select organ_id, question, options, correct_option, explanation
from questions
on conflict (organ_id, question) do nothing;

commit;